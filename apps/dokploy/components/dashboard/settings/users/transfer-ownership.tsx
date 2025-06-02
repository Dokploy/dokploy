import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import copy from "copy-to-clipboard";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Crown } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/router";

const transferOwnership = z.object({
	newOwnerId: z.string().min(1, "Please select a new owner"),
	confirmationText: z.string().refine(
		(val) => val === "TRANSFER OWNERSHIP",
		"Type 'TRANSFER OWNERSHIP' to confirm"
	),
});

type TransferOwnership = z.infer<typeof transferOwnership>;

export const TransferOwnership = () => {
    const router = useRouter();
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
  
	const { data: members } = api.user.all.useQuery();

	const { mutateAsync: transferOwner, isLoading } = api.organization.transferOwner.useMutation()

	const form = useForm<TransferOwnership>({
		defaultValues: {
			newOwnerId: "",
		},
		resolver: zodResolver(transferOwnership),
	});

	const eligibleMembers = members?.filter(member => member.role !== "owner") || [];

	const onSubmit = async (data: TransferOwnership) => {
		try {
			const result = await transferOwner({
				newOwnerId: data.newOwnerId,
				confirmationText: data.confirmationText,
			});

			toast.success(`Ownership transferred to ${result.newOwner.email}`);
			setOpen(false);
			form.reset();
			
			utils.user.all.invalidate();

      setTimeout(() => {
        toast.info("Redirecting to projects...")
        router.push("/dashboard/projects")
      }, 1000)
		} catch (error: any) {
			toast.error(error?.message || "Error transferring ownership");
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button className="hover:bg-destructive hover:text-destructive-foreground" size="sm">
					<Crown className="h-4 w-4 mr-2" />
					Transfer Ownership
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="mb-2">Transfer Ownership</DialogTitle>
          <AlertBlock type="error">
            <strong>Warning:</strong> This action cannot be undone. You will lose all owner privileges and become an admin.
          </AlertBlock>
				</DialogHeader>


				<Form {...form}>
					<form
						id="transfer-ownership-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="newOwnerId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>New Owner</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select new owner" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{eligibleMembers.map((member) => (
												<SelectItem key={member.user.id} value={member.user.id}>
													{member.user.email} ({member.role})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="confirmationText"
							render={({ field }) => (
								<FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <span>
                      To confirm, type{" "}
                      <Badge
                        className="p-2 rounded-md ml-1 mr-1 hover:border-primary hover:text-primary-foreground hover:bg-primary hover:cursor-pointer"
                        variant="outline"
                        onClick={() => {
                            copy('TRANSFER OWNERSHIP');
                            toast.success("Copied to clipboard. Be careful!");
                        }}
                      >TRANSFER OWNERSHIP
                        <Copy className="h-4 w-4 ml-1 text-muted-foreground" />
                      </Badge>{" "}
                      in the box below:
                    </span>
                  </FormLabel>
									<FormControl>
										<Input
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>
				</Form>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => {
							setOpen(false);
							form.reset();
						}}
						disabled={isLoading}
					>
						Cancel
					</Button>
					<Button
						form="transfer-ownership-form"
						type="submit"
						variant="destructive"
						isLoading={isLoading}
					>
						Transfer
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};