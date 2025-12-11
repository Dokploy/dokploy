import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
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

const createSchema = (t: (key: string) => string) =>
	z.object({
		name: z.string().min(1, {
			message: t("settings.gitProviders.validation.nameRequired"),
		}),
		giteaUrl: z.string().min(1, {
			message: t("settings.gitProviders.validation.giteaUrlRequired"),
		}),
		clientId: z.string().min(1, {
			message: t("settings.gitProviders.validation.clientIdRequired"),
		}),
		clientSecret: z.string().min(1, {
			message: t("settings.gitProviders.validation.clientSecretRequired"),
		}),
		redirectUri: z.string().min(1, {
			message: t("settings.gitProviders.validation.redirectUriRequired"),
		}),
		organizationName: z.string().optional(),
	});

type Schema = z.infer<ReturnType<typeof createSchema>>;

export const AddGiteaProvider = () => {
	const [isOpen, setIsOpen] = useState(false);
	const { t } = useTranslation("settings");

	const urlObj = useUrl();
	const baseUrl =
		typeof urlObj === "string" ? urlObj : (urlObj as any)?.url || "";

	const { mutateAsync, error, isError } = api.gitea.create.useMutation();
	const webhookUrl = `${baseUrl}/api/providers/gitea/callback`;
	const schema = createSchema(t);

	const form = useForm<Schema>({
		defaultValues: {
			clientId: "",
			clientSecret: "",
			redirectUri: webhookUrl,
			name: "",
			giteaUrl: "https://gitea.com",
		},
		resolver: zodResolver(schema),
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
				toast.error(
					t("settings.gitProviders.gitea.add.toast.noId"),
				);
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
				toast.error(
					t("settings.gitProviders.gitea.add.toast.incompleteTitle"),
					{
						description: t(
							"settings.gitProviders.gitea.add.toast.incompleteDescription",
						),
					},
				);
			}

			toast.success(
					t("settings.gitProviders.gitea.add.toast.success"),
				);
			setIsOpen(false);
		} catch (error: unknown) {
			if (error instanceof Error) {
				toast.error(
					t("settings.gitProviders.gitea.add.toast.error", {
						error: error.message,
					}),
				);
			} else {
				toast.error(
					t("settings.gitProviders.gitea.add.toast.unknownError"),
				);
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
					<span>{t("settings.gitProviders.gitea.add.button")}</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.gitProviders.gitea.add.title")} <GiteaIcon className="size-5" />
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
									{t("settings.gitProviders.gitea.add.description")}
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										{t("settings.gitProviders.gitea.add.steps.goToSettings")} {" "}
										<Link
												href={`${giteaUrl}/user/settings/applications`}
												target="_blank"
											>
												<ExternalLink className="w-fit text-primary size-4" />
											</Link>
									</li>
									<li>
										{t(
											"settings.gitProviders.gitea.add.steps.navigateApplications",
										)}
									</li>
									<li>
										{t(
											"settings.gitProviders.gitea.add.steps.createApplicationIntro",
										)}
										<ul className="list-disc list-inside ml-4">
											<li>
												{t(
													"settings.gitProviders.gitea.add.steps.appNameDokploy",
												)}
											</li>
											<li>
												{t(
													"settings.gitProviders.gitea.add.steps.redirectUriLabel",
												)}{" "}
												<span className="text-primary">{webhookUrl}</span>{" "}
											</li>
										</ul>
									</li>
									<li>
										{t("settings.gitProviders.gitea.add.steps.afterCreating")}
									</li>
								</ol>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.gitea.add.nameLabel")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.gitea.add.namePlaceholder",
													)}
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
											<FormLabel>
												{t("settings.gitProviders.gitea.add.giteaUrlLabel")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.gitea.add.giteaUrlPlaceholder",
													)}
													{...field}
												/>
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
											<FormLabel>
												{t("settings.gitProviders.gitea.add.redirectUriLabel")}
											</FormLabel>
											<FormControl>
												<Input
													disabled
													placeholder={t(
														"settings.gitProviders.gitea.add.redirectUriPlaceholder",
													)}
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
											<FormLabel>
												{t("settings.gitProviders.gitea.add.clientIdLabel")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.gitea.add.clientIdPlaceholder",
													)}
													{...field}
												/>
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
											<FormLabel>
												{t("settings.gitProviders.gitea.add.clientSecretLabel")}
											</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder={t(
														"settings.gitProviders.gitea.add.clientSecretPlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									{t("settings.gitProviders.gitea.add.submitButton")}
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
