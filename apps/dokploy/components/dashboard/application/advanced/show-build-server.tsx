import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Server } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
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

export const ShowBuildServer = ({ applicationId }: Props) => {
	const t = useTranslations("applicationAdvancedBuildServer");
	const tCommon = useTranslations("common");

	const schema = useMemo(
		() =>
			z
				.object({
					buildServerId: z.string().optional(),
					buildRegistryId: z.string().optional(),
				})
				.refine(
					(data) => {
						const buildServerIsNone =
							!data.buildServerId || data.buildServerId === "none";
						const buildRegistryIsNone =
							!data.buildRegistryId || data.buildRegistryId === "none";

						if (buildServerIsNone && buildRegistryIsNone) return true;
						if (!buildServerIsNone && !buildRegistryIsNone) return true;

						return false;
					},
					{
						message: t("validation.bothOrNone"),
						path: ["buildServerId"],
					},
				),
		[t],
	);

	type Schema = z.infer<typeof schema>;

	const { data, refetch } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);
	const { data: buildServers } = api.server.buildServers.useQuery();
	const { data: registries } = api.registry.all.useQuery();

	const { mutateAsync, isPending } = api.application.update.useMutation();

	const form = useForm<Schema>({
		defaultValues: {
			buildServerId: data?.buildServerId || "",
			buildRegistryId: data?.buildRegistryId || "",
		},
		resolver: zodResolver(schema),
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
				toast.success(t("toast.success"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("toast.error"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<div className="flex flex-row items-center gap-2">
					<Server className="size-6 text-muted-foreground" />
					<div>
						<CardTitle className="text-xl">{t("title")}</CardTitle>
						<CardDescription>{t("description")}</CardDescription>
					</div>
				</div>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">{t("alerts.infoOffload")}</AlertBlock>

				<AlertBlock type="info">
					{t.rich("alerts.infoImportantRich", {
						imp: (chunks) => <strong>{chunks}</strong>,
						not: (chunks) => <strong>{chunks}</strong>,
						logs: (chunks) => <strong>{chunks}</strong>,
					})}
				</AlertBlock>

				<AlertBlock type="info">
					{t.rich("alerts.infoNoteRich", {
						note: (chunks) => <strong>{chunks}</strong>,
					})}
				</AlertBlock>

				{!registries || registries.length === 0 ? (
					<AlertBlock type="warning">
						{t.rich("alerts.registryRequiredRich", {
							link: (chunks) => (
								<Link
									href="/dashboard/settings/registry"
									className="text-primary underline"
								>
									{chunks}
								</Link>
							),
						})}
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
									<FormLabel>{t("form.buildServer")}</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
											if (value === "none") {
												form.setValue("buildRegistryId", "none");
											}
										}}
										value={field.value || "none"}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder={t("form.placeholderServer")} />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="none">
													<span className="flex items-center gap-2">
														<span>{t("form.none")}</span>
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
													{t("form.buildServersCount", {
														count: buildServers?.length || 0,
													})}
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormDescription>{t("form.descServer")}</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="buildRegistryId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("form.buildRegistry")}</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
											if (value === "none") {
												form.setValue("buildServerId", "none");
											}
										}}
										value={field.value || "none"}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("form.placeholderRegistry")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="none">
													<span className="flex items-center gap-2">
														<span>{t("form.none")}</span>
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
													{t("form.registriesCount", {
														count: registries?.length || 0,
													})}
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormDescription>{t("form.descRegistry")}</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex w-full justify-end">
							<Button isLoading={isPending} type="submit">
								{tCommon("save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
