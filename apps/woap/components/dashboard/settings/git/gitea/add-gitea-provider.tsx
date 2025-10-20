import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { GiteaIcon } from "@/components/icons/data-tools-icons";
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
import { api } from "@/utils/api";
import {
	type GiteaProviderResponse,
	getGiteaOAuthUrl,
} from "@/utils/gitea-utils";
import { useUrl } from "@/utils/hooks/use-url";

const Schema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	giteaUrl: z.string().min(1, {
		message: "Gitea URL is required",
	}),
	clientId: z.string().min(1, {
		message: "Client ID is required",
	}),
	clientSecret: z.string().min(1, {
		message: "Client Secret is required",
	}),
	redirectUri: z.string().min(1, {
		message: "Redirect URI is required",
	}),
	organizationName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

export const AddGiteaProvider = () => {
	const [isOpen, setIsOpen] = useState(false);

	const urlObj = useUrl();
	const baseUrl =
		typeof urlObj === "string" ? urlObj : (urlObj as any)?.url || "";

	const { mutateAsync, error, isError } = api.gitea.create.useMutation();
	const webhookUrl = `${baseUrl}/api/providers/gitea/callback`;

	const form = useForm<Schema>({
		defaultValues: {
			clientId: "",
			clientSecret: "",
			redirectUri: webhookUrl,
			name: "",
			giteaUrl: "https://gitea.com",
		},
		resolver: zodResolver(Schema),
	});

	const giteaUrl = form.watch("giteaUrl");

	useEffect(() => {
		form.reset({
			clientId: "",
			clientSecret: "",
			redirectUri: webhookUrl,
			name: "",
			giteaUrl: "https://gitea.com",
		});
	}, [form, webhookUrl, isOpen]);

	const onSubmit = async (data: Schema) => {
		try {
			// Send the form data to create the Gitea provider
			const result = (await mutateAsync({
				clientId: data.clientId,
				clientSecret: data.clientSecret,
				name: data.name,
				redirectUri: data.redirectUri,
				giteaUrl: data.giteaUrl,
				organizationName: data.organizationName,
			})) as unknown as GiteaProviderResponse;

			// Check if we have a giteaId from the response
			if (!result || !result.giteaId) {
				toast.error("Failed to get Gitea ID from response");
				return;
			}

			// Generate OAuth URL using the shared utility
			const authUrl = getGiteaOAuthUrl(
				result.giteaId,
				data.clientId,
				data.giteaUrl,
				baseUrl,
			);

			// Open the Gitea OAuth URL
			if (authUrl !== "#") {
				window.open(authUrl, "_blank");
			} else {
				toast.error("Configuration Incomplete", {
					description: "Please fill in Client ID and Gitea URL first.",
				});
			}

			toast.success("Gitea provider created successfully");
			setIsOpen(false);
		} catch (error: unknown) {
			if (error instanceof Error) {
				toast.error(`Error configuring Gitea: ${error.message}`);
			} else {
				toast.error("An unknown error occurred.");
			}
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="default"
					className="flex items-center space-x-1 bg-green-700 text-white hover:bg-green-500"
				>
					<GiteaIcon />
					<span>Gitea</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Gitea Provider <GiteaIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-gitea"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<p className="text-muted-foreground text-sm">
									To integrate your Gitea account, you need to create a new
									application in your Gitea settings. Follow these steps:
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										Go to your Gitea settings{" "}
										<Link
											href={`${giteaUrl}/user/settings/applications`}
											target="_blank"
										>
											<ExternalLink className="w-fit text-primary size-4" />
										</Link>
									</li>
									<li>
										Navigate to Applications {"->"} Create new OAuth2
										Application
									</li>
									<li>
										Create a new application with the following details:
										<ul className="list-disc list-inside ml-4">
											<li>Name: Dokploy</li>
											<li>
												Redirect URI:{" "}
												<span className="text-primary">{webhookUrl}</span>{" "}
											</li>
										</ul>
									</li>
									<li>
										After creating, you'll receive an ID and Secret, copy them
										and paste them below.
									</li>
								</ol>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input
													placeholder="Random Name eg(my-personal-account)"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="giteaUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Gitea URL</FormLabel>
											<FormControl>
												<Input placeholder="https://gitea.com/" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="redirectUri"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Redirect URI</FormLabel>
											<FormControl>
												<Input
													disabled
													placeholder="Random Name eg(my-personal-account)"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="clientId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Client ID</FormLabel>
											<FormControl>
												<Input placeholder="Client ID" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="clientSecret"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Client Secret</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Client Secret"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									Configure Gitea App
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
