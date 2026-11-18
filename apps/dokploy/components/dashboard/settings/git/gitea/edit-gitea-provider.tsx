import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { getGiteaOAuthUrl } from "@/utils/gitea-utils";
import { useUrl } from "@/utils/hooks/use-url";

const formSchema = z.object({
	name: z.string().min(1, "settings.git.nameRequired"),
	giteaUrl: z.string().min(1, "settings.git.giteaUrlRequired"),
	giteaInternalUrl: z
		.union([z.string().url(), z.literal("")])
		.optional()
		.transform((v) => (v === "" ? undefined : v)),
	clientId: z.string().min(1, "settings.git.clientIdRequired"),
	clientSecret: z.string().min(1, "settings.git.clientSecretRequired"),
});

interface Props {
	giteaId: string;
}

export const EditGiteaProvider = ({ giteaId }: Props) => {
	const { t } = useTranslation();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const {
		data: gitea,
		isLoading,
		refetch,
	} = api.gitea.one.useQuery({ giteaId });
	const { mutateAsync, isPending: isUpdating } = api.gitea.update.useMutation();
	const { mutateAsync: testConnection, isPending: isTesting } =
		api.gitea.testConnection.useMutation();
	const url = useUrl();
	const utils = api.useUtils();

	useEffect(() => {
		const { connected, error } = router.query;

		if (!router.isReady) return;

		if (connected) {
			toast.success(t("settings.git.giteaConnected"), {
				description: t("settings.git.giteaConnectedDescription"),
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
			toast.error(t("settings.git.giteaConnectionFailed"), {
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

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			giteaUrl: "https://gitea.com",
			giteaInternalUrl: "",
			clientId: "",
			clientSecret: "",
		},
	});

	useEffect(() => {
		if (gitea) {
			form.reset({
				name: gitea.gitProvider?.name || "",
				giteaUrl: gitea.giteaUrl || "https://gitea.com",
				giteaInternalUrl: gitea.giteaInternalUrl || "",
				clientId: gitea.clientId || "",
				clientSecret: gitea.clientSecret || "",
			});
		}
	}, [gitea, form]);

	const onSubmit = async (values: z.infer<typeof formSchema>) => {
		await mutateAsync({
			giteaId: giteaId,
			gitProviderId: gitea?.gitProvider?.gitProviderId || "",
			name: values.name,
			giteaUrl: values.giteaUrl,
			giteaInternalUrl: values.giteaInternalUrl ?? null,
			clientId: values.clientId,
			clientSecret: values.clientSecret,
		})
			.then(async () => {
				await utils.gitProvider.getAll.invalidate();
				toast.success(t("settings.git.giteaUpdated"));
				await refetch();
				setOpen(false);
			})
			.catch(() => {
				toast.error(t("settings.git.giteaUpdateError"));
			});
	};

	const handleTestConnection = async () => {
		try {
			const result = await testConnection({ giteaId });
			toast.success(t("settings.git.giteaConnectionVerified"), {
				description: result,
			});
		} catch (error: any) {
			const authUrl = getGiteaOAuthUrl(giteaId);

			toast.error(t("settings.git.giteaNotConnected"), {
				description: error.message || t("settings.git.completeOAuth"),
				action: {
					label: t("settings.git.authorizeNow"),
					onClick: () => window.open(authUrl, "_blank"),
				},
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
					<DialogTitle>{t("settings.git.editGiteaProvider")}</DialogTitle>
					<DialogDescription>
						{t("settings.git.editGiteaDescription")}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("settings.git.name")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("settings.git.namePlaceholderGitea")}
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
									<FormLabel>{t("settings.git.giteaUrlLabel")}</FormLabel>
									<FormControl>
										<Input placeholder="https://gitea.example.com" {...field} />
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
											placeholder={t("settings.git.clientSecretPlaceholder")}
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
								{t("settings.git.testConnection")}
							</Button>

							<Button
								type="button"
								variant="outline"
								onClick={() => window.open(getGiteaOAuthUrl(giteaId), "_blank")}
							>
								{t("settings.git.connectGitea")}
							</Button>

							<Button type="submit" isLoading={isUpdating}>
								{t("settings.git.save")}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
