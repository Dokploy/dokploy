import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
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
		workspaceName: z.string().optional(),
		apiToken: z.string().optional(),
		appPassword: z.string().optional(),
	});

type Schema = z.infer<ReturnType<typeof createSchema>>;

interface Props {
	bitbucketId: string;
}

export const EditBitbucketProvider = ({ bitbucketId }: Props) => {
	const { t } = useTranslation("settings");
	const { data: bitbucket } = api.bitbucket.one.useQuery(
		{
			bitbucketId,
		},
		{
			enabled: !!bitbucketId,
		},
	);

	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } = api.bitbucket.update.useMutation();
	const { mutateAsync: testConnection, isLoading } =
		api.bitbucket.testConnection.useMutation();
	const schema = createSchema(t);
	const form = useForm<Schema>({
		defaultValues: {
			username: "",
			email: "",
			workspaceName: "",
			apiToken: "",
			appPassword: "",
		},
		resolver: zodResolver(schema),
	});

	const username = form.watch("username");
	const email = form.watch("email");
	const workspaceName = form.watch("workspaceName");
	const apiToken = form.watch("apiToken");
	const appPassword = form.watch("appPassword");

	useEffect(() => {
		form.reset({
			username: bitbucket?.bitbucketUsername || "",
			email: bitbucket?.bitbucketEmail || "",
			workspaceName: bitbucket?.bitbucketWorkspaceName || "",
			name: bitbucket?.gitProvider.name || "",
			apiToken: bitbucket?.apiToken || "",
			appPassword: bitbucket?.appPassword || "",
		});
	}, [form, isOpen, bitbucket]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			bitbucketId,
			gitProviderId: bitbucket?.gitProviderId || "",
			bitbucketUsername: data.username,
			bitbucketEmail: data.email || "",
			bitbucketWorkspaceName: data.workspaceName || "",
			name: data.name || "",
			apiToken: data.apiToken || "",
			appPassword: data.appPassword || "",
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(
						t("settings.gitProviders.bitbucket.edit.toast.updatedSuccess"),
					);
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
						t("settings.gitProviders.bitbucket.edit.toast.updatedError"),
					);
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
			<DialogContent className="sm:max-w-2xl ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.gitProviders.bitbucket.edit.title")} <BitbucketIcon className="size-5" />
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
									{t("settings.gitProviders.bitbucket.edit.description")}
								</p>

								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.gitProviders.bitbucket.edit.nameLabel")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.edit.namePlaceholder",
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
													"settings.gitProviders.bitbucket.edit.usernameLabel",
												)}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.edit.usernamePlaceholder",
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
												{t("settings.gitProviders.bitbucket.edit.emailLabel")}
											</FormLabel>
											<FormControl>
												<Input
													type="email"
													placeholder={t(
														"settings.gitProviders.bitbucket.edit.emailPlaceholder",
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
													"settings.gitProviders.bitbucket.edit.workspaceNameLabel",
												)}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.gitProviders.bitbucket.edit.workspaceNamePlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<div className="flex flex-col gap-2 border-t pt-4">
									<h3 className="text-sm font-medium mb-2">
										{t("settings.gitProviders.bitbucket.edit.authSectionTitle")}
									</h3>
									<FormField
										control={form.control}
										name="apiToken"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("settings.gitProviders.bitbucket.edit.apiTokenLabel")}
												</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"settings.gitProviders.bitbucket.edit.apiTokenPlaceholder",
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
										name="appPassword"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("settings.gitProviders.bitbucket.edit.appPasswordLabel")}
												</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"settings.gitProviders.bitbucket.edit.appPasswordPlaceholder",
														)}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>

								<div className="flex w-full justify-between gap-4 mt-4">
									<Button
										type="button"
										variant={"secondary"}
										isLoading={isLoading}
										onClick={async () => {
											await testConnection({
												bitbucketId,
												bitbucketUsername: username,
												bitbucketEmail: email,
												workspaceName: workspaceName,
												apiToken: apiToken,
												appPassword: appPassword,
											})
												.then(async (message) => {
													toast.info(
														t(
															"settings.gitProviders.bitbucket.edit.toast.testSuccessMessage",
															{
																message,
															},
														),
													);
												})
												.catch((error: any) => {
													toast.error(
														t(
															"settings.gitProviders.bitbucket.edit.toast.testErrorMessage",
															{
																error: error.message,
															},
														),
													);
												});
										}}
									>
										{t("settings.gitProviders.bitbucket.edit.testButton")}
									</Button>
									<Button type="submit" isLoading={form.formState.isSubmitting}>
										{t("settings.gitProviders.bitbucket.edit.updateButton")}
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
