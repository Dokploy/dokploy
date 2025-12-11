import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { getGiteaOAuthUrl } from "@/utils/gitea-utils";
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
	});

interface Props {
	giteaId: string;
}

export const EditGiteaProvider = ({ giteaId }: Props) => {
	const { t } = useTranslation("settings");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const {
		data: gitea,
		isLoading,
		refetch,
	} = api.gitea.one.useQuery({ giteaId });
	const { mutateAsync, isLoading: isUpdating } = api.gitea.update.useMutation();
	const { mutateAsync: testConnection, isLoading: isTesting } =
		api.gitea.testConnection.useMutation();
	const url = useUrl();
	const utils = api.useUtils();
	const schema = createSchema(t);

	useEffect(() => {
		const { connected, error } = router.query;

		if (!router.isReady) return;

		if (connected) {
			toast.success(
					t(
						"settings.gitProviders.gitea.edit.toast.connectionSuccessTitle",
					),
				{
					description: t(
						"settings.gitProviders.gitea.edit.toast.connectionSuccessDescription",
					),
					id: "gitea-connection-success",
				},
			);
			refetch();
			router.replace(
				{
					pathname: router.pathname,
					query: {},
				},
				undefined,
				{ shallow: true },
			);
		}

		if (error) {
			toast.error(
					t(
						"settings.gitProviders.gitea.edit.toast.connectionFailedTitle",
					),
				{
					description: decodeURIComponent(error as string),
					id: "gitea-connection-error",
				},
			);
			router.replace(
				{
					pathname: router.pathname,
					query: {},
				},
				undefined,
				{ shallow: true },
			);
		}
	}, [router.query, router.isReady, refetch]);

	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: {
			name: "",
			giteaUrl: "https://gitea.com",
			clientId: "",
			clientSecret: "",
		},
	});

	useEffect(() => {
		if (gitea) {
			form.reset({
				name: gitea.gitProvider?.name || "",
				giteaUrl: gitea.giteaUrl || "https://gitea.com",
				clientId: gitea.clientId || "",
				clientSecret: gitea.clientSecret || "",
			});
		}
	}, [gitea, form]);

	const onSubmit = async (values: z.infer<typeof schema>) => {
		await mutateAsync({
			giteaId: giteaId,
			gitProviderId: gitea?.gitProvider?.gitProviderId || "",
			name: values.name,
			giteaUrl: values.giteaUrl,
			clientId: values.clientId,
			clientSecret: values.clientSecret,
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(t("settings.gitProviders.gitea.edit.toast.updatedSuccess"));
				await refetch();
				setOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.gitProviders.gitea.edit.toast.updatedError"));
			});
	};

	const handleTestConnection = async () => {
		try {
			const result = await testConnection({ giteaId });
			toast.success(t("settings.gitProviders.gitea.edit.toast.testSuccessTitle"), {
				description: result,
			});
		} catch (error: any) {
			const formValues = form.getValues();
			const authUrl =
				error.authorizationUrl ||
				getGiteaOAuthUrl(
					giteaId,
					formValues.clientId,
					formValues.giteaUrl,
					typeof url === "string" ? url : (url as any).url || "",
				);

			toast.error(
						t("settings.gitProviders.gitea.edit.toast.notConnectedTitle"),
				{
					description:
						error.message ||
						t(
							"settings.gitProviders.gitea.edit.toast.notConnectedDescription",
						),
					action:
						authUrl && authUrl !== "#"
							? {
									label: t(
										"settings.gitProviders.gitea.edit.toast.notConnectedAuthorizeLabel",
									),
									onClick: () => window.open(authUrl, "_blank"),
								}
							: undefined,
				},
			);
		}
	};

	if (isLoading) {
		return (
			<Button variant="ghost" size="icon" disabled>
				<PenBoxIcon className="h-4 w-4 text-muted-foreground" />
			</Button>
		);
	}

	// Function to handle dialog open state
	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10"
				>
					<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{t("settings.gitProviders.gitea.edit.title")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.gitProviders.gitea.edit.description")}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("settings.gitProviders.gitea.edit.nameLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"settings.gitProviders.gitea.edit.namePlaceholder",
											)}
											{...field}
											autoFocus={false}
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
										{t("settings.gitProviders.gitea.edit.giteaUrlLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"settings.gitProviders.gitea.edit.giteaUrlPlaceholder",
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
										{t("settings.gitProviders.gitea.edit.clientIdLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"settings.gitProviders.gitea.edit.clientIdPlaceholder",
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
										{t("settings.gitProviders.gitea.edit.clientSecretLabel")}
									</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder={t(
												"settings.gitProviders.gitea.edit.clientSecretPlaceholder",
											)}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={handleTestConnection}
								isLoading={isTesting}
							>
								{t("settings.gitProviders.gitea.edit.testButton")}
							</Button>

							<Button
								type="button"
								variant="outline"
								onClick={() => {
									const formValues = form.getValues();
									const authUrl = getGiteaOAuthUrl(
										giteaId,
										formValues.clientId,
										formValues.giteaUrl,
										typeof url === "string" ? url : (url as any).url || "",
									);
									if (authUrl !== "#") {
										window.open(authUrl, "_blank");
									}
								}}
							>
								{t("settings.gitProviders.gitea.edit.connectButton")}
							</Button>

							<Button type="submit" isLoading={isUpdating}>
								{t("settings.gitProviders.gitea.edit.saveButton")}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
