import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { GitlabIcon } from "@/components/icons/data-tools-icons";
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
import { useUrl } from "@/utils/hooks/use-url";

const Schema = z.object({
	name: z.string().min(1, {
		message: "settings.git.nameRequired",
	}),
	gitlabUrl: z.string().min(1, {
		message: "settings.git.gitlabUrlRequired",
	}),
	gitlabInternalUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.transform((v) => (v === "" ? undefined : v)),
	applicationId: z.string().min(1, {
		message: "settings.git.applicationIdRequired",
	}),
	applicationSecret: z.string().min(1, {
		message: "settings.git.applicationSecretRequired",
	}),

	redirectUri: z.string().min(1, {
		message: "settings.git.redirectUriRequired",
	}),
	groupName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

export const AddGitlabProvider = () => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const url = useUrl();
	const { data: auth } = api.user.get.useQuery();
	const { mutateAsync, error, isError } = api.gitlab.create.useMutation();
	const webhookUrl = `${url}/api/providers/gitlab/callback`;

	const form = useForm({
		defaultValues: {
			applicationId: "",
			applicationSecret: "",
			groupName: "",
			redirectUri: webhookUrl,
			name: "",
			gitlabUrl: "https://gitlab.com",
			gitlabInternalUrl: "",
		},
		resolver: zodResolver(Schema),
	});

	const gitlabUrl = form.watch("gitlabUrl");

	useEffect(() => {
		form.reset({
			applicationId: "",
			applicationSecret: "",
			groupName: "",
			redirectUri: webhookUrl,
			name: "",
			gitlabUrl: "https://gitlab.com",
			gitlabInternalUrl: "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			applicationId: data.applicationId || "",
			secret: data.applicationSecret || "",
			groupName: data.groupName || "",
			authId: auth?.id || "",
			name: data.name || "",
			redirectUri: data.redirectUri || "",
			gitlabUrl: data.gitlabUrl || "https://gitlab.com",
			gitlabInternalUrl: data.gitlabInternalUrl || undefined,
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(t("settings.git.gitlabCreated"));
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.git.gitlabCreateError"));
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="default"
					className="flex items-center space-x-1 bg-purple-700 text-white hover:bg-purple-600"
				>
					<GitlabIcon />
					<span>GitLab</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl  ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.git.gitlabProvider")} <GitlabIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-gitlab"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<p className="text-muted-foreground text-sm">
									{t("settings.git.gitlabIntro")}
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										{t("settings.git.gitlabStep1")}{" "}
										<Link
											href={`${gitlabUrl}/-/profile/applications`}
											target="_blank"
										>
											<ExternalLink className="w-fit text-primary size-4" />
										</Link>
									</li>
									<li>{t("settings.git.gitlabStep2")}</li>
									<li>
										{t("settings.git.gitlabStep3")}
										<ul className="list-disc list-inside ml-4">
											<li>{t("settings.git.gitlabStepName")}</li>
											<li>
												{t("settings.git.redirectUri")}{" "}
												<span className="text-primary">{webhookUrl}</span>{" "}
											</li>
											<li>{t("settings.git.gitlabStepScopes")}</li>
										</ul>
									</li>
									<li>{t("settings.git.gitlabStep4")}</li>
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
									name="gitlabUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.gitlabUrlLabel")}</FormLabel>
											<FormControl>
												<Input placeholder="https://gitlab.com/" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="gitlabInternalUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.internalUrl")}</FormLabel>
											<FormControl>
												<Input
													placeholder="http://gitlab:80"
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											<FormDescription>
												{t("settings.git.internalUrlDescription")}
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
									name="applicationId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.applicationId")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.git.applicationIdPlaceholder",
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
									name="applicationSecret"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.git.applicationSecret")}
											</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder={t(
														"settings.git.applicationSecretPlaceholder",
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
									name="groupName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.groupName")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("settings.git.groupNamePlaceholder")}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									{t("settings.git.configureGitlabApp")}
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
