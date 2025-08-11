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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { useUrl } from "@/utils/hooks/use-url";
import { zodResolver } from "@hookform/resolvers/zod";

import { ExternalLink } from "lucide-react";
import { type TFunction, useTranslation } from "next-i18next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const Schema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, {
			message: t("settings.gitProviders.gitlab.nameRequired"),
		}),
		gitlabUrl: z.string().min(1, {
			message: t("settings.gitProviders.gitlab.urlRequired"),
		}),
		applicationId: z.string().min(1, {
			message: t("settings.gitProviders.gitlab.applicationIdRequired"),
		}),
		applicationSecret: z.string().min(1, {
			message: t("settings.gitProviders.gitlab.applicationSecretRequired"),
		}),

		redirectUri: z.string().min(1, {
			message: t("settings.gitProviders.gitlab.redirectUriRequired"),
		}),
		groupName: z.string().optional(),
	});

type Schema = ReturnType<typeof Schema>["_type"];

export const AddGitlabProvider = () => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const url = useUrl();
	const { data: auth } = api.user.get.useQuery();
	const { mutateAsync, error, isError } = api.gitlab.create.useMutation();
	const webhookUrl = `${url}/api/providers/gitlab/callback`;

	const form = useForm<Schema>({
		defaultValues: {
			applicationId: "",
			applicationSecret: "",
			groupName: "",
			redirectUri: webhookUrl,
			name: "",
			gitlabUrl: "https://gitlab.com",
		},
		resolver: zodResolver(Schema(t)),
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
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(t("settings.gitProviders.gitlab.create.success"));
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.gitProviders.gitlab.create.error"));
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
					<span>{t("settings.gitProviders.gitlab")}</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl  ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.gitProviders.gitlab.title")}{" "}
						<GitlabIcon className="size-5" />
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
									{t("settings.gitProviders.gitlab.description")}
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										{t("settings.gitProviders.gitlab.step1")}{" "}
										<Link
											href={`${gitlabUrl}/-/profile/applications`}
											target="_blank"
										>
											<ExternalLink className="w-fit text-primary size-4" />
										</Link>
									</li>
									<li>{t("settings.gitProviders.gitlab.step2")}</li>
									<li>
										{t("settings.gitProviders.gitlab.step3")}
										<ul className="list-disc list-inside ml-4">
											<li>{t("settings.gitProviders.gitlab.step3.name")}</li>
											<li>
												{t("settings.gitProviders.gitlab.step3.redirectUri")}{" "}
												<span className="text-primary">{webhookUrl}</span>{" "}
											</li>
											<li>{t("settings.gitProviders.gitlab.step3.scopes")}</li>
										</ul>
									</li>
									<li>{t("settings.gitProviders.gitlab.step4")}</li>
								</ol>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.gitlab.name")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.gitlab.namePlaceholder",
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
									name="gitlabUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.gitlab.url")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.gitlab.urlPlaceholder",
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
												{t("settings.gitProviders.gitlab.redirectUri")}
											</FormLabel>
											<FormControl>
												<Input
													disabled
													placeholder={t(
														"settings.gitProviders.gitlab.namePlaceholder",
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
									name="applicationId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.gitlab.applicationId")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.gitlab.applicationId",
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
												{t("settings.gitProviders.gitlab.applicationSecret")}
											</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder={t(
														"settings.gitProviders.gitlab.applicationSecret",
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
											<FormLabel>
												{t("settings.gitProviders.gitlab.groupName")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.gitlab.groupNamePlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									{t("settings.gitProviders.gitlab.create")}
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
