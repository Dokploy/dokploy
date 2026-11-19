import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
	FormDescription,
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
		message: "settings.git.nameRequired",
	}),
	giteaUrl: z.string().min(1, {
		message: "settings.git.giteaUrlRequired",
	}),
	giteaInternalUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.transform((v) => (v === "" ? undefined : v)),
	clientId: z.string().min(1, {
		message: "settings.git.clientIdRequired",
	}),
	clientSecret: z.string().min(1, {
		message: "settings.git.clientSecretRequired",
	}),
	redirectUri: z.string().min(1, {
		message: "settings.git.redirectUriRequired",
	}),
	organizationName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

export const AddGiteaProvider = () => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);

	const urlObj = useUrl();
	const baseUrl =
		typeof urlObj === "string" ? urlObj : (urlObj as any)?.url || "";

	const { mutateAsync, error, isError } = api.gitea.create.useMutation();
	const webhookUrl = `${baseUrl}/api/providers/gitea/callback`;

	const form = useForm({
		defaultValues: {
			clientId: "",
			clientSecret: "",
			redirectUri: webhookUrl,
			name: "",
			giteaUrl: "https://gitea.com",
			giteaInternalUrl: "",
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
			giteaInternalUrl: "",
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
				giteaInternalUrl: data.giteaInternalUrl || undefined,
				organizationName: data.organizationName,
			})) as unknown as GiteaProviderResponse;

			// Check if we have a giteaId from the response
			if (!result || !result.giteaId) {
				toast.error(t("settings.git.giteaIdMissing"));
				return;
			}

			window.open(getGiteaOAuthUrl(result.giteaId), "_blank");

			toast.success(t("settings.git.giteaCreated"));
			setIsOpen(false);
		} catch (error: unknown) {
			if (error instanceof Error) {
				toast.error(
					t("settings.git.giteaConfigureError", { message: error.message }),
				);
			} else {
				toast.error(t("settings.git.unknownError"));
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
						{t("settings.git.giteaProvider")} <GiteaIcon className="size-5" />
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
									{t("settings.git.giteaIntro")}
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										{t("settings.git.giteaStep1")}{" "}
										<Link
											href={`${giteaUrl}/user/settings/applications`}
											target="_blank"
										>
											<ExternalLink className="w-fit text-primary size-4" />
										</Link>
									</li>
									<li>{t("settings.git.giteaStep2")}</li>
									<li>
										{t("settings.git.giteaStep3")}
										<ul className="list-disc list-inside ml-4">
											<li>{t("settings.git.giteaStepName")}</li>
											<li>
												{t("settings.git.redirectUri")}{" "}
												<span className="text-primary">{webhookUrl}</span>{" "}
											</li>
										</ul>
									</li>
									<li>{t("settings.git.giteaStep4")}</li>
								</ol>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.name")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("settings.git.namePlaceholder")}
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
											<FormLabel>{t("settings.git.giteaUrlLabel")}</FormLabel>
											<FormControl>
												<Input placeholder="https://gitea.com/" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="giteaInternalUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.internalUrl")}</FormLabel>
											<FormControl>
												<Input
													placeholder="http://gitea:3000"
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											<FormDescription>
												{t("settings.git.internalUrlDescriptionGitea")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="redirectUri"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.redirectUri")}</FormLabel>
											<FormControl>
												<Input
													disabled
													placeholder={t("settings.git.namePlaceholder")}
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
											<FormLabel>{t("settings.git.clientId")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("settings.git.clientIdPlaceholder")}
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
											<FormLabel>{t("settings.git.clientSecret")}</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder={t(
														"settings.git.clientSecretPlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									{t("settings.git.configureGiteaApp")}
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
