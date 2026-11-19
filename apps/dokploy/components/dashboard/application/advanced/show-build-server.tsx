import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Server } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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

const schema = z
	.object({
		buildServerId: z.string().optional(),
		buildRegistryId: z.string().optional(),
	})
	.refine(
		(data) => {
			// Both empty/none is valid
			const buildServerIsNone =
				!data.buildServerId || data.buildServerId === "none";
			const buildRegistryIsNone =
				!data.buildRegistryId || data.buildRegistryId === "none";

			// Both should be either filled or empty
			if (buildServerIsNone && buildRegistryIsNone) return true;
			if (!buildServerIsNone && !buildRegistryIsNone) return true;

			return false;
		},
		{
			message: "application.buildServer.selectTogether",
			path: ["buildServerId"], // Show error on buildServerId field
		},
	);

type Schema = z.infer<typeof schema>;

export const ShowBuildServer = ({ applicationId }: Props) => {
	const { t } = useTranslation();
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
				toast.success(t("application.buildServer.updated"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.buildServer.updateError"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<div className="flex flex-row items-center gap-2">
					<Server className="size-6 text-muted-foreground" />
					<div>
						<CardTitle className="text-xl">
							{t("application.buildServer.title")}
						</CardTitle>
						<CardDescription>
							{t("application.buildServer.description")}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">{t("application.buildServer.info")}</AlertBlock>

				<AlertBlock type="info">
					📊 <strong>{t("application.buildServer.important")}</strong>{" "}
					{t("application.buildServer.downloadInfo")}
				</AlertBlock>

				<AlertBlock type="info">
					<strong>{t("application.buildServer.note")}</strong>{" "}
					{t("application.buildServer.noteDescription")}
				</AlertBlock>

				{!registries || registries.length === 0 ? (
					<AlertBlock type="warning">
						{t("application.buildServer.registryRequired")}{" "}
						<Link
							href="/dashboard/settings/registry"
							className="text-primary underline"
						>
							{t("application.buildServer.settings")}
						</Link>{" "}
						{t("application.buildServer.registryRequiredSuffix")}
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
										{t("application.buildServer.buildServer")}
									</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
											// If setting to "none", also reset build registry to "none"
											if (value === "none") {
												form.setValue("buildRegistryId", "none");
											}
										}}
										value={field.value || "none"}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t(
														"application.buildServer.selectServer",
													)}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="none">
													<span className="flex items-center gap-2">
														<span>{t("application.buildServer.none")}</span>
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
													{t("application.buildServer.serversCount", {
														amount: buildServers?.length || 0,
													})}
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormDescription>
										{t("application.buildServer.serverDescription")}
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
										{t("application.buildServer.buildRegistry")}
									</FormLabel>
									<Select
										onValueChange={(value) => {
											field.onChange(value);
											// If setting to "none", also reset build server to "none"
											if (value === "none") {
												form.setValue("buildServerId", "none");
											}
										}}
										value={field.value || "none"}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t(
														"application.buildServer.selectRegistry",
													)}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="none">
													<span className="flex items-center gap-2">
														<span>{t("application.buildServer.none")}</span>
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
													{t("application.buildServer.registriesCount", {
														amount: registries?.length || 0,
													})}
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormDescription>
										{t("application.buildServer.registryDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex w-full justify-end">
							<Button isLoading={isPending} type="submit">
								{t("application.buildServer.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
