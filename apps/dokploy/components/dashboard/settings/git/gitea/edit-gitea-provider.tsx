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
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
import { type TFunction, useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const formSchema = (t: TFunction) =>
	z.object({
		name: z
			.string()
			.min(1, t("settings.gitProviders.gitea.update.nameRequired")),
		giteaUrl: z
			.string()
			.min(1, t("settings.gitProviders.gitea.update.urlRequired")),
		clientId: z
			.string()
			.min(1, t("settings.gitProviders.gitea.update.clientIdRequired")),
		clientSecret: z
			.string()
			.min(1, t("settings.gitProviders.gitea.update.clientSecretRequired")),
	});

type FormSchema = ReturnType<typeof formSchema>["_type"];

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

	useEffect(() => {
		const { connected, error } = router.query;

		if (!router.isReady) return;

		if (connected) {
			toast.success("Successfully connected to Gitea", {
				description: "Your Gitea provider has been authorized.",
				id: "gitea-connection-success",
			});
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
			toast.error("Gitea Connection Failed", {
				description: decodeURIComponent(error as string),
				id: "gitea-connection-error",
			});
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

	const form = useForm<FormSchema>({
		resolver: zodResolver(formSchema(t)),
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

	const onSubmit = async (values: FormSchema) => {
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
				toast.success(t("settings.gitProviders.gitea.update.success"));
				await refetch();
				setOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.gitProviders.gitea.update.error"));
			});
	};

	const handleTestConnection = async () => {
		try {
			const result = await testConnection({ giteaId });
			toast.success("Gitea Connection Verified", {
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

			toast.error("Gitea Not Connected", {
				description:
					error.message || "Please complete the OAuth authorization process.",
				action:
					authUrl && authUrl !== "#"
						? {
								label: "Authorize Now",
								onClick: () => window.open(authUrl, "_blank"),
							}
						: undefined,
			});
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
						{t("settings.gitProviders.gitea.update.title")}
					</DialogTitle>
					<DialogDescription>
						Update your Gitea provider details.
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
										{t("settings.gitProviders.gitea.update.name")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"settings.gitProviders.gitea.update.namePlaceholder",
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
										{t("settings.gitProviders.gitea.update.url")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"settings.gitProviders.gitea.update.urlPlaceholder",
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
										{t("settings.gitProviders.gitea.update.clientId")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"settings.gitProviders.gitea.update.clientId",
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
										{t("settings.gitProviders.gitea.update.clientSecret")}
									</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder={t(
												"settings.gitProviders.gitea.update.clientSecret",
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
								{t("settings.gitProviders.gitea.update.testConnection")}
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
								Connect to Gitea
							</Button>

							<Button type="submit" isLoading={isUpdating}>
								{t("settings.gitProviders.gitea.update.update")}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
