import type { DokployNetwork } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const UpdateNetworkSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
	isDefault: z.boolean().default(false),
});

type UpdateNetwork = z.infer<typeof UpdateNetworkSchema>;

interface Props {
	network: DokployNetwork;
}

export const UpdateNetwork = ({ network }: Props) => {
	const [visible, setVisible] = useState(false);
	const utils = api.useUtils();

	const { mutateAsync, isLoading, error, isError } =
		api.network.update.useMutation();

	const form = useForm<UpdateNetwork>({
		defaultValues: {
			name: network.name,
			description: network.description || "",
			isDefault: network.isDefault,
		},
		resolver: zodResolver(UpdateNetworkSchema),
	});

	const onSubmit = async (data: UpdateNetwork) => {
		try {
			await mutateAsync({
				networkId: network.networkId,
				...data,
			});

			toast.success("Network updated successfully");
			await utils.network.all.invalidate();
			setVisible(false);
		} catch (error) {
			console.error("Failed to update network:", error);
		}
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					onSelect={(e) => {
						e.preventDefault();
						setVisible(true);
					}}
				>
					<Edit className="mr-2 h-4 w-4" />
					Edit
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Update Network</DialogTitle>
					<DialogDescription>
						Update the network settings (network name and driver cannot be
						changed)
					</DialogDescription>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="grid gap-4">
							<div className="rounded-lg border bg-muted/50 p-3">
								<div className="space-y-1">
									<div className="text-sm font-medium">Docker Network Name</div>
									<code className="text-sm text-muted-foreground">
										{network.networkName}
									</code>
								</div>
								<div className="mt-2 space-y-1">
									<div className="text-sm font-medium">Driver</div>
									<div className="text-sm text-muted-foreground">
										{network.driver}
									</div>
								</div>
								<p className="mt-2 text-xs text-muted-foreground">
									These fields cannot be changed after creation
								</p>
							</div>

							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="Production Network" {...field} />
										</FormControl>
										<FormDescription>
											A friendly name for this network
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Network for production services..."
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="isDefault"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Default Network
											</FormLabel>
											<FormDescription>
												Auto-assign to new resources in this project
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								onClick={() => setVisible(false)}
							>
								Cancel
							</Button>
							<Button type="submit" isLoading={isLoading}>
								Update Network
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
