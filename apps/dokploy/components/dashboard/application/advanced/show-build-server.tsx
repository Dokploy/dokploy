import { zodResolver } from "@hookform/resolvers/zod";
import { Server } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
}

const createBuildServerSchema = (t: (key: string) => string) =>
	z.object({
		buildServerId: z
			.string()
			.min(1, t("buildServer.validation.serverRequired")),
		buildRegistryId: z
			.string()
			.min(1, t("buildServer.validation.registryRequired")),
	});

type Schema = z.infer<ReturnType<typeof createBuildServerSchema>>;

export const ShowBuildServer = ({ applicationId }: Props) => {
	const { t } = useTranslation("common");
	const { data, refetch } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);
	const { data: buildServers } = api.server.buildServers.useQuery();
	const { data: registries } = api.registry.all.useQuery();

	const { mutateAsync, isLoading } = api.application.update.useMutation();

	const form = useForm<Schema>({
		defaultValues: {
			buildServerId: data?.buildServerId || "",
			buildRegistryId: data?.buildRegistryId || "",
		},
		resolver: zodResolver(createBuildServerSchema(t)),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				buildServerId: data?.buildServerId || "",
				buildRegistryId: data?.buildRegistryId || "",
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (formData: Schema) => {
		await mutateAsync({
			applicationId,
			buildServerId:
				formData?.buildServerId === "none" || !formData?.buildServerId
					? null
					: formData?.buildServerId,
			buildRegistryId:
				formData?.buildRegistryId === "none" || !formData?.buildRegistryId
					? null
					: formData?.buildRegistryId,
		})
			.then(async () => {
				toast.success(t("buildServer.toast.updateSuccess"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("buildServer.toast.updateError"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<div className="flex flex-row items-center gap-2">
					<Server className="size-6 text-muted-foreground" />
					<div>
						<CardTitle className="text-xl">
							{t("buildServer.card.title")}
						</CardTitle>
						<CardDescription>
							{t("buildServer.card.description")}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					{t("buildServer.alert.description")}
				</AlertBlock>

				<AlertBlock type="info">
					{t("buildServer.alert.downloadReminder")}
				</AlertBlock>

				{!registries || registries.length === 0 ? (
					<AlertBlock type="warning">
						{t("buildServer.alert.noRegistry.prefix")}{" "}
						<Link
							href="/dashboard/settings/registry"
							className="text-primary underline"
						>
							{t("buildServer.alert.noRegistry.link")}
						</Link>{" "}
						{t("buildServer.alert.noRegistry.suffix")}
					</AlertBlock>
				) : null}

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="buildServerId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("buildServer.form.serverLabel")}
									</FormLabel>
									<Select
										onValueChange={field.onChange}
										value={field.value || "none"}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("buildServer.form.serverPlaceholder")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="none">
													<span className="flex items-center gap-2">
														<span>{t("buildServer.form.none")}</span>
													</span>
												</SelectItem>
												{buildServers?.map((server) => (
													<SelectItem
														key={server.serverId}
														value={server.serverId}
													>
														<span className="flex items-center gap-2 justify-between w-full">
															<span>{server.name}</span>
															<span className="text-muted-foreground text-xs">
																{server.ipAddress}
															</span>
														</span>
													</SelectItem>
												))}
												<SelectLabel>
													{t("buildServer.form.serverCountLabel", {
														count: buildServers?.length ?? 0,
													})}
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormDescription>
										{t("buildServer.form.serverDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="buildRegistryId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("buildServer.form.registryLabel")}
									</FormLabel>
									<Select
										onValueChange={field.onChange}
										value={field.value || "none"}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("buildServer.form.registryPlaceholder")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="none">
													<span className="flex items-center gap-2">
														<span>{t("buildServer.form.none")}</span>
													</span>
												</SelectItem>
												{registries?.map((registry) => (
													<SelectItem
														key={registry.registryId}
														value={registry.registryId}
													>
														{registry.registryName}
													</SelectItem>
												))}
												<SelectLabel>
													{t("buildServer.form.registryCountLabel", {
														count: registries?.length ?? 0,
													})}
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormDescription>
										{t("buildServer.form.registryDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex w-full justify-end">
							<Button isLoading={isLoading} type="submit">
								{t("button.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
