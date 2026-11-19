import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
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
	name: z.string().min(1, { message: "settings.git.nameRequired" }),
	username: z.string().min(1, { message: "settings.git.usernameRequired" }),
	email: z.string().email().optional(),
	apiToken: z.string().min(1, { message: "settings.git.apiTokenRequired" }),
	workspaceName: z.string().optional(),
});

type Schema = z.infer<typeof Schema>;

export const AddBitbucketProvider = () => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError } = api.bitbucket.create.useMutation();
	const { data: auth } = api.user.get.useQuery();
	const form = useForm<Schema>({
		defaultValues: {
			username: "",
			apiToken: "",
			workspaceName: "",
		},
		resolver: zodResolver(Schema),
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
				toast.success(t("settings.git.bitbucketCreated"));
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.git.bitbucketCreateError"));
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
					<span>Bitbucket</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl ">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.git.bitbucketProvider")}{" "}
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
								<AlertBlock type="warning">
									{t("settings.git.apiTokenWarning")}
								</AlertBlock>

								<div className="mt-1 text-sm">
									{t("settings.git.manageTokensIn")}
									<Link
										href="https://id.atlassian.com/manage-profile/security/api-tokens"
										target="_blank"
										className="inline-flex items-center gap-1 ml-1"
									>
										<span>{t("settings.git.bitbucketSettingsLink")}</span>
										<ExternalLink className="w-fit text-primary size-4" />
									</Link>
								</div>
								<ul className="list-disc list-inside ml-4 text-sm text-muted-foreground">
									<li className="text-muted-foreground text-sm">
										{t("settings.git.bitbucketStep1")}
									</li>
									<li className="text-muted-foreground text-sm">
										{t("settings.git.bitbucketStep2")}
									</li>
									<li className="text-muted-foreground text-sm">
										{t("settings.git.bitbucketStep3")}
									</li>
								</ul>
								<p className="text-muted-foreground text-sm">
									{t("settings.git.selectScopes")}
								</p>

								<ul className="list-disc list-inside ml-4 text-sm text-muted-foreground">
									<li>read:repository:bitbucket</li>
									<li>read:pullrequest:bitbucket</li>
									<li>read:webhook:bitbucket</li>
									<li>read:workspace:bitbucket</li>
									<li>write:webhook:bitbucket</li>
								</ul>

								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.git.name")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.git.namePlaceholderBitbucket",
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
											<FormLabel>{t("settings.git.bitbucketEmail")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"settings.git.bitbucketEmailPlaceholder",
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
											<FormLabel>{t("settings.git.apiToken")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("settings.git.apiTokenPlaceholder")}
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

								<Button isLoading={form.formState.isSubmitting}>
									{t("settings.git.configureBitbucket")}
								</Button>
							</div>
						</CardContent>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
