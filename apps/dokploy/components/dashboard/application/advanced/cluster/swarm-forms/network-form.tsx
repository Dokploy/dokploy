import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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

const driverOptEntrySchema = z.object({
	key: z.string(),
	value: z.string(),
});

export const networkFormSchema = z.object({
	networks: z
		.array(
			z.object({
				Target: z.string().optional(),
				Aliases: z.string().optional(),
				DriverOptsEntries: z.array(driverOptEntrySchema).optional(),
			}),
		)
		.optional(),
});

interface NetworkFormProps {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const NetworkForm = ({ id, type }: NetworkFormProps) => {
	const t = useTranslations("applicationAdvancedSwarmForms");
	const [isLoading, setIsLoading] = useState(false);

	const queryMap = {
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });

	const mutationMap = {
		postgres: () => api.postgres.update.useMutation(),
		redis: () => api.redis.update.useMutation(),
		mysql: () => api.mysql.update.useMutation(),
		mariadb: () => api.mariadb.update.useMutation(),
		application: () => api.application.update.useMutation(),
		mongo: () => api.mongo.update.useMutation(),
	};

	const { mutateAsync } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const form = useForm<z.infer<typeof networkFormSchema>>({
		resolver: zodResolver(networkFormSchema),
		defaultValues: {
			networks: [],
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "networks",
	});

	useEffect(() => {
		if (data?.networkSwarm && Array.isArray(data.networkSwarm)) {
			const networkEntries = data.networkSwarm.map((network) => ({
				Target: network.Target || "",
				Aliases: network.Aliases?.join(", ") || "",
				DriverOptsEntries: network.DriverOpts
					? Object.entries(network.DriverOpts).map(([key, value]) => ({
							key,
							value: value ?? "",
						}))
					: [],
			}));
			form.reset({ networks: networkEntries });
		}
	}, [data, form]);

	const onSubmit = async (formData: z.infer<typeof networkFormSchema>) => {
		setIsLoading(true);
		try {
			const networksArray =
				formData.networks
					?.filter((network) => network.Target)
					.map((network) => {
						const entries = (network.DriverOptsEntries ?? []).filter(
							(e) => e.key.trim() !== "",
						);
						const driverOpts =
							entries.length > 0
								? Object.fromEntries(
										entries.map((e) => [e.key.trim(), e.value]),
									)
								: undefined;
						return {
							Target: network.Target,
							Aliases: network.Aliases
								? network.Aliases.split(",").map((alias) => alias.trim())
								: undefined,
							DriverOpts: driverOpts,
						};
					}) || [];

			const networksToSend = networksArray.length > 0 ? networksArray : null;

			await mutateAsync({
				applicationId: id || "",
				postgresId: id || "",
				redisId: id || "",
				mysqlId: id || "",
				mariadbId: id || "",
				mongoId: id || "",
				networkSwarm: networksToSend,
			});

			toast.success(t("network.toastSuccess"));
			refetch();
		} catch {
			toast.error(t("network.toastError"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				<div>
					<FormLabel>{t("network.section")}</FormLabel>
					<FormDescription>{t("network.sectionDesc")}</FormDescription>
					<div className="space-y-2 mt-2">
						{fields.map((field, index) => (
							<div key={field.id} className="space-y-2 p-3 border rounded">
								<FormField
									control={form.control}
									name={`networks.${index}.Target`}
									render={({ field: targetField }) => (
										<FormItem>
											<FormLabel>{t("network.networkName")}</FormLabel>
											<FormControl>
												<Input
													{...targetField}
													placeholder={t("network.placeholderNetwork")}
												/>
											</FormControl>
											<FormDescription>{t("network.networkNameDesc")}</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name={`networks.${index}.Aliases`}
									render={({ field: aliasesField }) => (
										<FormItem>
											<FormLabel>{t("network.aliases")}</FormLabel>
											<FormControl>
												<Input
													{...aliasesField}
													placeholder={t("network.aliasesPlaceholder")}
												/>
											</FormControl>
											<FormDescription>{t("network.aliasesDesc")}</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="space-y-2">
									<FormLabel>{t("network.driverOpts")}</FormLabel>
									<FormDescription>{t("network.driverOptsDesc")}</FormDescription>
									{(form.watch(`networks.${index}.DriverOptsEntries`) ?? []).map(
										(_, optIndex) => (
											<div
												key={optIndex}
												className="flex gap-2 items-end flex-wrap"
											>
												<FormField
													control={form.control}
													name={`networks.${index}.DriverOptsEntries.${optIndex}.key`}
													render={({ field: keyField }) => (
														<FormItem className="flex-1 min-w-[140px]">
															<FormControl>
																<Input
																	{...keyField}
																	placeholder={t(
																		"network.placeholderDriverKey",
																	)}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name={`networks.${index}.DriverOptsEntries.${optIndex}.value`}
													render={({ field: valueField }) => (
														<FormItem className="flex-1 min-w-[100px]">
															<FormControl>
																<Input
																	{...valueField}
																	placeholder={t(
																		"network.placeholderDriverValue",
																	)}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => {
														const entries =
															form.getValues(
																`networks.${index}.DriverOptsEntries`,
															) ?? [];
														form.setValue(
															`networks.${index}.DriverOptsEntries`,
															entries.filter((_, i) => i !== optIndex),
														);
													}}
												>
													{t("network.remove")}
												</Button>
											</div>
										),
									)}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											const entries =
												form.getValues(`networks.${index}.DriverOptsEntries`) ??
												[];
											form.setValue(`networks.${index}.DriverOptsEntries`, [
												...entries,
												{ key: "", value: "" },
											]);
										}}
									>
										{t("network.addDriverOption")}
									</Button>
								</div>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={() => remove(index)}
								>
									{t("network.removeNetwork")}
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								append({
									Target: "",
									Aliases: "",
									DriverOptsEntries: [],
								})
							}
						>
							{t("network.addNetwork")}
						</Button>
					</div>
				</div>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							form.reset({ networks: [] });
						}}
					>
						{t("actions.clear")}
					</Button>
					<Button type="submit" isLoading={isLoading}>
						{t("actions.saveNetworks")}
					</Button>
				</div>
			</form>
		</Form>
	);
};
