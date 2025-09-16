import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { GithubIcon } from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const Schema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	githubAppName: z.string().min(1, {
		message: "GitHub App URL is required",
	}),
	githubAppId: z.string().min(1, {
		message: "App ID is required",
	}),
	githubClientId: z.string().min(1, {
		message: "Client ID is required",
	}),
	githubClientSecret: z.string().min(1, {
		message: "Client Secret is required",
	}),
	githubPrivateKey: z.string().min(1, {
		message: "Private Key is required",
	}),
	githubWebhookSecret: z.string().min(1, {
		message: "Webhook Secret is required",
	}),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	githubId: string;
}

export const EditGithubProvider = ({ githubId }: Props) => {
	const { data: github } = api.github.one.useQuery(
		{
			githubId,
		},
		{
			enabled: !!githubId,
		},
	);
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } = api.github.update.useMutation();
	const { mutateAsync: testConnection, isLoading } =
		api.github.testConnection.useMutation();
	const form = useForm<Schema>({
		defaultValues: {
			name: "",
			githubAppName: "",
			githubAppId: "",
			githubClientId: "",
			githubClientSecret: "",
			githubPrivateKey: "",
			githubWebhookSecret: "",
		},
		resolver: zodResolver(Schema),
	});

	useEffect(() => {
		form.reset({
			name: github?.gitProvider.name || "",
			githubAppName: github?.githubAppName || "",
			githubAppId: github?.githubAppId?.toString() || "",
			githubClientId: github?.githubClientId || "",
			githubClientSecret: github?.githubClientSecret || "",
			githubPrivateKey: github?.githubPrivateKey || "",
			githubWebhookSecret: github?.githubWebhookSecret || "",
		});
	}, [form, isOpen, github]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			githubId,
			name: data.name,
			gitProviderId: github?.gitProviderId || "",
			githubAppName: data.githubAppName,
			githubAppId: Number.parseInt(data.githubAppId, 10),
			githubClientId: data.githubClientId,
			githubClientSecret: data.githubClientSecret,
			githubPrivateKey: data.githubPrivateKey,
			githubWebhookSecret: data.githubWebhookSecret,
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success("GitHub provider updated successfully");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating GitHub provider");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 "
				>
					<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Update GitHub Provider <GithubIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-edit-github"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input
													placeholder="e.g., my-github-app"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="githubAppName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>GitHub App URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://github.com/apps/your-app-name"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="githubAppId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>App ID</FormLabel>
											<FormControl>
												<Input placeholder="123456" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="githubClientId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Client ID</FormLabel>
											<FormControl>
												<Input
													placeholder="Iv1.a1b2c3d4e5f6g7h8"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="githubClientSecret"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Client Secret</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="********************************"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="githubWebhookSecret"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Webhook Secret</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Your webhook secret"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="githubPrivateKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Private Key (PEM format)</FormLabel>
											<FormControl>
												<Textarea
													placeholder="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
													className="font-mono text-xs min-h-[150px]"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<div className="flex w-full justify-between gap-4 mt-4">
									<Button
										type="button"
										variant={"secondary"}
										isLoading={isLoading}
										onClick={async () => {
											await testConnection({
												githubId,
											})
												.then(async (message) => {
													toast.info(`Message: ${message}`);
												})
												.catch((error) => {
													toast.error(`Error: ${error.message}`);
												});
										}}
									>
										Test Connection
									</Button>
									<Button type="submit" isLoading={form.formState.isSubmitting}>
										Update
									</Button>
								</div>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};