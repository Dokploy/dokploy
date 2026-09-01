import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AzureDevopsIcon } from "@/components/icons/data-tools-icons";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
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
import { api } from "@/utils/api";

const schema = z.object({
	name: z.string().min(1, "Name is required"),
	organizationName: z.string().min(1, "Organization is required"),
	personalAccessToken: z.string().min(1, "Personal access token is required"),
});
type FormData = z.infer<typeof schema>;

export const AddAzureDevopsProvider = () => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { data: auth } = api.user.get.useQuery();
	const mutation = api.azureDevops.create.useMutation();
	const form = useForm<FormData>({
		resolver: zodResolver(schema),
		defaultValues: { name: "", organizationName: "", personalAccessToken: "" },
	});
	const submit = async (values: FormData) => {
		await mutation.mutateAsync({ ...values, authId: auth?.id ?? "" });
		await utils.gitProvider.getAll.invalidate();
		toast.success("Azure DevOps configured successfully");
		setOpen(false);
		form.reset();
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="secondary"
					className="gap-2 bg-[#0078d4] text-white hover:bg-[#106ebe]"
				>
					<AzureDevopsIcon className="size-4" /> Azure DevOps
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AzureDevopsIcon className="size-5" />
						Azure DevOps Provider
					</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					Use a Personal Access Token with Code (Read) permission. Add Service
					Hooks (Read & manage) if you want to configure webhooks through the
					Azure API.
				</p>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Provider name</FormLabel>
									<FormControl>
										<Input placeholder="My Azure DevOps" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="organizationName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Azure DevOps organization</FormLabel>
									<FormControl>
										<Input placeholder="contoso" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="personalAccessToken"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Personal Access Token</FormLabel>
									<FormControl>
										<Input
											type="password"
											autoComplete="new-password"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button
							type="submit"
							className="w-full"
							isLoading={mutation.isPending}
						>
							Configure Azure DevOps
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
