import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const createSchema = (t: (key: string) => string) =>
	z.object({
		name: z.string().min(1, {
			message: t("settings.gitProviders.validation.nameRequired"),
		}),
		username: z.string().min(1, {
			message: t("settings.gitProviders.validation.usernameRequired"),
		}),
		email: z.string().email().optional(),
		apiToken: z.string().min(1, {
			message: t("settings.gitProviders.validation.apiTokenRequired"),
		}),
		workspaceName: z.string().optional(),
	});

type Schema = z.infer<ReturnType<typeof createSchema>>;

export const AddBitbucketProvider = () => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { t } = useTranslation("settings");
	const { mutateAsync, error, isError } = api.bitbucket.create.useMutation();
	const { data: auth } = api.user.get.useQuery();
	const schema = createSchema(t);
	const form = useForm<Schema>({
		defaultValues: {
			username: "",
			apiToken: "",
			workspaceName: "",
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		form.reset({
			username: "",
			email: "",
			apiToken: "",
			workspaceName: "",
		});
	}, [form, isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			bitbucketUsername: data.username,
			apiToken: data.apiToken,
			bitbucketWorkspaceName: data.workspaceName || "",
			authId: auth?.id || "",
			name: data.name || "",
			bitbucketEmail: data.email || "",
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(
						t("settings.gitProviders.bitbucket.add.toast.success"),
					);
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
						t("settings.gitProviders.bitbucket.add.toast.error"),
					);
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
					<span>{t("settings.gitProviders.bitbucket.add.button")}</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.gitProviders.bitbucket.add.title")} <BitbucketIcon className="size-5" />
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
								<AlertBlock type="warning">
									{t(
										"settings.gitProviders.bitbucket.add.warning.appPasswordDeprecated",
									)}
								</AlertBlock>

								<div className="mt-1 text-sm">
									{t(
										"settings.gitProviders.bitbucket.add.manageTokensIntro",
									)}{" "}
									<Link
										href="https://id.atlassian.com/manage-profile/security/api-tokens"
										target="_blank"
										className="inline-flex items-center gap-1 ml-1"
									>
										<span>
											{t(
												"settings.gitProviders.bitbucket.add.manageTokensLinkText",
											)}
										</span>
										<ExternalLink className="w-fit text-primary size-4" />
									</Link>
								</div>
								<ul className="list-disc list-inside ml-4 text-sm text-muted-foreground">
									<li className="text-muted-foreground text-sm">
										{t("settings.gitProviders.bitbucket.add.guide.createToken")}
									</li>
									<li className="text-muted-foreground text-sm">
										{t("settings.gitProviders.bitbucket.add.guide.selectExpiration")}
									</li>
									<li className="text-muted-foreground text-sm">
										{t("settings.gitProviders.bitbucket.add.guide.selectProduct")}
									</li>
								</ul>
								<p className="text-muted-foreground text-sm">
									{t("settings.gitProviders.bitbucket.add.scopes.title")}
								</p>

								<ul className="list-disc list-inside ml-4 text-sm text-muted-foreground">
									<li>
										{t(
											"settings.gitProviders.bitbucket.add.scopes.readRepository",
										)}
									</li>
									<li>
										{t(
											"settings.gitProviders.bitbucket.add.scopes.readPullRequest",
										)}
									</li>
									<li>
										{t(
											"settings.gitProviders.bitbucket.add.scopes.readWebhook",
										)}
									</li>
									<li>
										{t(
											"settings.gitProviders.bitbucket.add.scopes.readWorkspace",
										)}
									</li>
									<li>
										{t(
											"settings.gitProviders.bitbucket.add.scopes.writeWebhook",
										)}
									</li>
								</ul>

								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.add.nameLabel")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.add.namePlaceholder",
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
												{t(
													"settings.gitProviders.bitbucket.add.usernameLabel",
												)}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.add.usernamePlaceholder",
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
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.add.emailLabel")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.add.emailPlaceholder",
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
									name="apiToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.add.apiTokenLabel")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.add.apiTokenPlaceholder",
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
												{t(
													"settings.gitProviders.bitbucket.add.workspaceNameLabel",
												)}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.add.workspaceNamePlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<Button isLoading={form.formState.isSubmitting}>
									{t("settings.gitProviders.bitbucket.add.submitButton")}
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
