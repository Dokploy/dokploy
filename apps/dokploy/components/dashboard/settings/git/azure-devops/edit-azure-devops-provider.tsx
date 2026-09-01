import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
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
	name: z.string().min(1),
	organizationName: z.string().min(1),
	personalAccessToken: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

export const EditAzureDevopsProvider = ({
	azureDevopsId,
}: {
	azureDevopsId: string;
}) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { data } = api.azureDevops.one.useQuery(
		{ azureDevopsId },
		{ enabled: open },
	);
	const update = api.azureDevops.update.useMutation();
	const test = api.azureDevops.testConnection.useMutation();
	const form = useForm<FormData>({
		resolver: zodResolver(schema),
		defaultValues: { name: "", organizationName: "", personalAccessToken: "" },
	});
	useEffect(() => {
		if (data)
			form.reset({
				name: data.gitProvider.name,
				organizationName: data.organizationName,
				personalAccessToken: data.personalAccessToken ?? "",
			});
	}, [data, form]);
	const submit = async (values: FormData) => {
		await update.mutateAsync({ azureDevopsId, ...values });
		await utils.gitProvider.getAll.invalidate();
		toast.success("Azure DevOps updated successfully");
		setOpen(false);
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon">
					<Pencil className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AzureDevopsIcon className="size-5" />
						Update Azure DevOps
					</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Provider name</FormLabel>
									<FormControl>
										<Input {...field} />
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
									<FormLabel>Organization</FormLabel>
									<FormControl>
										<Input {...field} />
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
						<div className="flex justify-between">
							<Button
								type="button"
								variant="secondary"
								isLoading={test.isPending}
								onClick={() =>
									test
										.mutateAsync({ azureDevopsId })
										.then((message) => toast.success(message))
										.catch((error) => toast.error(error.message))
								}
							>
								Test connection
							</Button>
							<Button type="submit" isLoading={update.isPending}>
								Save
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
