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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import { AddSwarmSettings } from "./modify-swarm-settings";

interface Props {
	id: string;
	type: "application" | "mariadb" | "mongo" | "mysql" | "postgres" | "redis";
}

const AddRedirectSchema = z.object({
	replicas: z.number().min(1, "application.cluster.replicasMin"),
	registryId: z.string().optional(),
});

type AddCommand = z.infer<typeof AddRedirectSchema>;

export const ShowClusterSettings = ({ id, type }: Props) => {
	const { t } = useTranslation();
	const queryMap = {
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });
	const { data: registries } = api.registry.all.useQuery();

	const mutationMap = {
		application: () => api.application.update.useMutation(),
		libsql: () => api.libsql.update.useMutation(),
		mariadb: () => api.mariadb.update.useMutation(),
		mongo: () => api.mongo.update.useMutation(),
		mysql: () => api.mysql.update.useMutation(),
		postgres: () => api.postgres.update.useMutation(),
		redis: () => api.redis.update.useMutation(),
	};

	const { mutateAsync, isPending } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const form = useForm<AddCommand>({
		defaultValues: {
			...(type === "application" && data && "registryId" in data
				? {
						registryId: data?.registryId || "",
					}
				: {}),
			replicas: data?.replicas || 1,
		},
		resolver: zodResolver(AddRedirectSchema),
	});

	const savedReplicas = data?.replicas;
	const savedRegistryId =
		data && "registryId" in data ? data.registryId : undefined;

	// Not on the whole `data`: the page polls it and a reset would wipe unsaved edits
	useEffect(() => {
		if (savedReplicas === undefined) return;
		form.reset({
			...(type === "application" ? { registryId: savedRegistryId || "" } : {}),
			replicas: savedReplicas || 1,
		});
	}, [form, id, type, savedReplicas, savedRegistryId]);

	const onSubmit = async (data: AddCommand) => {
		await mutateAsync({
			applicationId: id || "",
			mariadbId: id || "",
			mongoId: id || "",
			mysqlId: id || "",
			postgresId: id || "",
			redisId: id || "",
			...(type === "application"
				? {
						registryId:
							data?.registryId === "none" || !data?.registryId
								? null
								: data?.registryId,
					}
				: {}),
			replicas: data?.replicas,
		})
			.then(async () => {
				toast.success(t("application.cluster.updated"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.cluster.updateError"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">
						{t("application.cluster.title")}
					</CardTitle>
					<CardDescription>
						{t("application.cluster.description")}
					</CardDescription>
				</div>
				<AddSwarmSettings id={id} type={type} />
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					{t("application.cluster.redeployHint")}
				</AlertBlock>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="replicas"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("application.cluster.replicas")}</FormLabel>
										<FormControl>
											<Input
												placeholder="1"
												{...field}
												onChange={(e) => {
													const value = e.target.value;
													field.onChange(value === "" ? 0 : Number(value));
												}}
												type="number"
												value={field.value || ""}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{type === "application" && (
							<>
								{registries && registries?.length === 0 ? (
									<div className="pt-10">
										<div className="flex flex-col items-center gap-3">
											<Server className="size-8 text-muted-foreground" />
											<span className="text-base text-muted-foreground">
												{t("application.cluster.registryRequired")}{" "}
												<Link
													href="/dashboard/docker?tab=swarm&subtab=nodes"
													className="text-foreground"
												>
													{t("application.cluster.settings")}
												</Link>
												{t("application.cluster.registryRequiredSuffix")}
											</span>
										</div>
									</div>
								) : (
									<>
										<FormField
											control={form.control}
											name="registryId"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("application.cluster.selectRegistry")}
													</FormLabel>
													<Select
														onValueChange={field.onChange}
														value={field.value}
													>
														<SelectTrigger>
															<SelectValue
																placeholder={t(
																	"application.cluster.selectRegistry",
																)}
															/>
														</SelectTrigger>
														<SelectContent>
															<SelectGroup>
																{registries?.map((registry) => (
																	<SelectItem
																		key={registry.registryId}
																		value={registry.registryId}
																	>
																		{registry.registryName}
																	</SelectItem>
																))}
																<SelectItem value={"none"}>
																	{t("application.cluster.none")}
																</SelectItem>
																<SelectLabel>
																	{t("application.cluster.registriesCount", {
																		amount: registries?.length,
																	})}
																</SelectLabel>
															</SelectGroup>
														</SelectContent>
													</Select>
												</FormItem>
											)}
										/>
									</>
								)}
							</>
						)}

						<div className="flex justify-end">
							<Button isLoading={isPending} type="submit" className="w-fit">
								{t("application.cluster.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
