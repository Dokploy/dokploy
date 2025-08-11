import { BitbucketIcon } from "@/components/icons/data-tools-icons";
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
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const Schema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, {
			message: t("settings.gitProviders.bitbucket.nameRequired"),
		}),
		username: z.string().min(1, {
			message: t("settings.gitProviders.bitbucket.usernameRequired"),
		}),
		password: z.string().min(1, {
			message: t("settings.gitProviders.bitbucket.appPasswordRequired"),
		}),
		workspaceName: z.string().optional(),
	});

type Schema = ReturnType<typeof Schema>["_type"];

export const AddBitbucketProvider = () => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const _url = useUrl();
	const { mutateAsync, error, isError } = api.bitbucket.create.useMutation();
	const { data: auth } = api.user.get.useQuery();
	const _router = useRouter();
	const form = useForm<Schema>({
		defaultValues: {
			username: "",
			password: "",
			workspaceName: "",
		},
		resolver: zodResolver(Schema(t)),
	});

	useEffect(() => {
		form.reset({
			username: "",
			password: "",
			workspaceName: "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			bitbucketUsername: data.username,
			appPassword: data.password,
			bitbucketWorkspaceName: data.workspaceName || "",
			authId: auth?.id || "",
			name: data.name || "",
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(t("settings.gitProviders.bitbucket.create.success"));
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.gitProviders.bitbucket.create.error"));
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="secondary"
					className="flex items-center space-x-1 bg-blue-700 text-white hover:bg-blue-600"
				>
					<BitbucketIcon />
					<span>{t("settings.gitProviders.bitbucket")}</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.gitProviders.bitbucket.title")}{" "}
						<BitbucketIcon className="size-5" />
					</DialogTitle>
				</DialogHeader>

				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-add-bitbucket"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-1"
					>
						<CardContent className="p-0">
							<div className="flex flex-col gap-4">
								<p className="text-muted-foreground text-sm">
									{t("settings.gitProviders.bitbucket.description")}
								</p>
								<ol className="list-decimal list-inside text-sm text-muted-foreground">
									<li className="flex flex-row gap-2 items-center">
										{t("settings.gitProviders.bitbucket.step1")}{" "}
										<Link
											href="https://bitbucket.org/account/settings/app-passwords/new"
											target="_blank"
										>
											<ExternalLink className="w-fit text-primary size-4" />
										</Link>
									</li>
									<li>
										{t("settings.gitProviders.bitbucket.step2")}
										<ul className="list-disc list-inside ml-4">
											<li>
												{t("settings.gitProviders.bitbucket.step2.account")}
											</li>
											<li>
												{t("settings.gitProviders.bitbucket.step2.workspace")}
											</li>
											<li>
												{t("settings.gitProviders.bitbucket.step2.projects")}
											</li>
											<li>
												{t(
													"settings.gitProviders.bitbucket.step2.repositories",
												)}
											</li>
											<li>
												{t(
													"settings.gitProviders.bitbucket.step2.pullRequests",
												)}
											</li>
											<li>
												{t("settings.gitProviders.bitbucket.step2.webhooks")}
											</li>
										</ul>
									</li>
									<li>{t("settings.gitProviders.bitbucket.step3")}</li>
								</ol>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.name")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.namePlaceholder",
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
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.username")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.usernamePlaceholder",
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
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.appPassword")}
											</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder={t(
														"settings.gitProviders.bitbucket.appPasswordPlaceholder",
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
									name="workspaceName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.workspaceName")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.workspaceNamePlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									{t("settings.gitProviders.bitbucket.create")}
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
