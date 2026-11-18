import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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

const Schema = z.object({
	name: z.string().min(1, {
		message: "settings.git.nameRequired",
	}),
	username: z.string().min(1, {
		message: "settings.git.usernameRequired",
	}),
	email: z.string().email().optional(),
	workspaceName: z.string().optional(),
	apiToken: z.string().optional(),
	appPassword: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	bitbucketId: string;
}

export const EditBitbucketProvider = ({ bitbucketId }: Props) => {
	const { t } = useTranslation();
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
	const { mutateAsync: testConnection, isPending } =
		api.bitbucket.testConnection.useMutation();
	const form = useForm<Schema>({
		defaultValues: {
			username: "",
			email: "",
			workspaceName: "",
			apiToken: "",
			appPassword: "",
		},
		resolver: zodResolver(Schema),
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
				toast.success(t("settings.git.bitbucketUpdated"));
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.git.bitbucketUpdateError"));
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
						{t("settings.git.updateBitbucket")}{" "}
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
									{t("settings.git.bitbucketEditIntro")}
								</p>

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
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.git.bitbucketUsername")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.git.bitbucketUsernamePlaceholder",
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
												{t("settings.git.bitbucketEmailApiToken")}
											</FormLabel>
											<FormControl>
												<Input
													type="email"
													placeholder={t(
														"settings.git.bitbucketEmailAddressPlaceholder",
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
											<FormLabel>{t("settings.git.workspaceName")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.git.workspaceNamePlaceholder",
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
										{t("settings.git.authSectionTitle")}
									</h3>
									<FormField
										control={form.control}
										name="apiToken"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("settings.git.apiTokenRecommended")}
												</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"settings.git.apiTokenEnterPlaceholder",
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
													{t("settings.git.appPasswordLegacy")}
												</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"settings.git.appPasswordPlaceholder",
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
										isLoading={isPending}
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
														t("settings.git.testConnectionMessage", {
															message,
														}),
													);
												})
												.catch((error) => {
													toast.error(
														t("settings.git.testConnectionError", {
															message: error.message,
														}),
													);
												});
										}}
									>
										{t("settings.git.testConnection")}
									</Button>
									<Button type="submit" isLoading={form.formState.isSubmitting}>
										{t("settings.git.update")}
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
