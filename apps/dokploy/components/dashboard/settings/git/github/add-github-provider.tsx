import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
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
import { useUrl } from "@/utils/hooks/use-url";

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

export const AddGithubProvider = () => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const url = useUrl();
	const { data: auth } = api.user.get.useQuery();
	const { mutateAsync, error, isError } = api.github.create.useMutation();
	const webhookUrl = `${url}/api/deploy/github`;
	const callbackUrl = `${url}/api/providers/github/setup`;

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
			name: "",
			githubAppName: "",
			githubAppId: "",
			githubClientId: "",
			githubClientSecret: "",
			githubPrivateKey: "",
			githubWebhookSecret: "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			name: data.name,
			githubAppName: data.githubAppName,
			githubAppId: Number.parseInt(data.githubAppId, 10),
			githubClientId: data.githubClientId,
			githubClientSecret: data.githubClientSecret,
			githubPrivateKey: data.githubPrivateKey,
			githubWebhookSecret: data.githubWebhookSecret,
			authId: auth?.id || "",
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success("GitHub provider created successfully");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error creating GitHub provider");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" className="flex items-center space-x-1">
					<GithubIcon className="text-current fill-current" />
					<span>Github</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						GitHub Provider <GithubIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-github"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<p className="text-muted-foreground text-sm">
									To integrate your GitHub account, you need to create a GitHub
									App. Follow these steps:
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										Go to GitHub Apps settings{" "}
										<Link
											href="https://github.com/settings/apps/new"
											target="_blank"
										>
											<ExternalLink className="w-fit text-primary size-4" />
										</Link>
									</li>
									<li>
										Configure your GitHub App with:
										<ul className="list-disc list-inside ml-4 mt-1">
											<li>
												<strong>Webhook URL:</strong>{" "}
												<span className="text-primary font-mono text-xs">
													{webhookUrl}
												</span>
											</li>
											<li>
												<strong>Callback URL:</strong>{" "}
												<span className="text-primary font-mono text-xs">
													{callbackUrl}
												</span>
											</li>
											<li>
												<strong>
													Request user authorization (OAuth) during
													installation:
												</strong>{" "}
												Yes
											</li>
											<li>
												<strong>Expire user authorization tokens:</strong> No
											</li>
										</ul>
									</li>
									<li>
										Set the following permissions:
										<ul className="list-disc list-inside ml-4 mt-1">
											<li>Contents: Read</li>
											<li>Metadata: Read</li>
											<li>Emails: Read</li>
											<li>Pull requests: Write</li>
										</ul>
									</li>
									<li>
										Subscribe to these events:
										<ul className="list-disc list-inside ml-4 mt-1">
											<li>Push</li>
											<li>Pull request</li>
										</ul>
									</li>
									<li>
										After creating the app, copy the following values and paste
										them below:
										<ul className="list-disc list-inside ml-4 mt-1">
											<li>App ID</li>
											<li>Client ID</li>
											<li>Client Secret (generate one if needed)</li>
											<li>Private Key (generate and download)</li>
											<li>Webhook Secret (optional but recommended)</li>
										</ul>
									</li>
								</ol>

								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input placeholder="e.g., my-github-app" {...field} />
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
												<Input placeholder="Iv1.a1b2c3d4e5f6g7h8" {...field} />
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

								<Button isLoading={form.formState.isSubmitting}>
									Create GitHub Provider
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
