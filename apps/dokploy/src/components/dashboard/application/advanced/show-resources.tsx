import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { InfoIcon, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
	createConverter,
	NumberInputWithSteps,
} from "@/components/ui/number-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const CPU_STEP = 0.25;
const MEMORY_STEP_MB = 256;

const formatNumber = (value: number, decimals = 2): string =>
	Number.isInteger(value) ? String(value) : value.toFixed(decimals);

export type ServiceType =
	| "postgres"
	| "mongo"
	| "redis"
	| "mysql"
	| "mariadb"
	| "application";

interface Props {
	id: string;
	type: ServiceType | "application";
}

const ULIMIT_VALUES = [
	"nofile",
	"nproc",
	"memlock",
	"stack",
	"core",
	"cpu",
	"data",
	"fsize",
	"locks",
	"msgqueue",
	"nice",
	"rtprio",
	"sigpending",
] as const;

export const ShowResources = ({ id, type }: Props) => {
	const t = useTranslations("applicationAdvancedResources");
	const tCommon = useTranslations("common");

	const addResourcesSchema = useMemo(() => {
		const ulimitSchema = z.object({
			Name: z.string().min(1, t("validation.nameRequired")),
			Soft: z.coerce.number().int().min(-1, t("validation.minMinusOne")),
			Hard: z.coerce.number().int().min(-1, t("validation.minMinusOne")),
		});
		return z.object({
			memoryReservation: z.string().optional(),
			cpuLimit: z.string().optional(),
			memoryLimit: z.string().optional(),
			cpuReservation: z.string().optional(),
			ulimitsSwarm: z.array(ulimitSchema).optional(),
		});
	}, [t]);

	type AddResources = z.infer<typeof addResourcesSchema>;

	const cpuConverter = useMemo(
		() =>
			createConverter(1_000_000_000, (cpu) =>
				cpu <= 0 ? "" : `${formatNumber(cpu)} ${t("units.cpu")}`,
			),
		[t],
	);

	const memoryConverter = useMemo(
		() =>
			createConverter(1024 * 1024, (mb) => {
				if (mb <= 0) return "";
				return mb >= 1024
					? `${formatNumber(mb / 1024)} ${t("units.gb")}`
					: `${formatNumber(mb)} ${t("units.mb")}`;
			}),
		[t],
	);

	const ulimitPresets = useMemo(
		() =>
			ULIMIT_VALUES.map((value) => ({
				value,
				label: t(
					`ulimitPresets.${value}` as
						| "ulimitPresets.nofile"
						| "ulimitPresets.nproc"
						| "ulimitPresets.memlock"
						| "ulimitPresets.stack"
						| "ulimitPresets.core"
						| "ulimitPresets.cpu"
						| "ulimitPresets.data"
						| "ulimitPresets.fsize"
						| "ulimitPresets.locks"
						| "ulimitPresets.msgqueue"
						| "ulimitPresets.nice"
						| "ulimitPresets.rtprio"
						| "ulimitPresets.sigpending",
				),
			})),
		[t],
	);

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

	const { mutateAsync, isPending } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const form = useForm({
		defaultValues: {
			cpuLimit: "",
			cpuReservation: "",
			memoryLimit: "",
			memoryReservation: "",
			ulimitsSwarm: [],
		},
		resolver: zodResolver(addResourcesSchema),
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "ulimitsSwarm",
	});

	useEffect(() => {
		if (data) {
			form.reset({
				cpuLimit: data?.cpuLimit || undefined,
				cpuReservation: data?.cpuReservation || undefined,
				memoryLimit: data?.memoryLimit || undefined,
				memoryReservation: data?.memoryReservation || undefined,
				ulimitsSwarm: data?.ulimitsSwarm || [],
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: AddResources) => {
		await mutateAsync({
			mongoId: id || "",
			postgresId: id || "",
			redisId: id || "",
			mysqlId: id || "",
			mariadbId: id || "",
			applicationId: id || "",
			cpuLimit: formData.cpuLimit || null,
			cpuReservation: formData.cpuReservation || null,
			memoryLimit: formData.memoryLimit || null,
			memoryReservation: formData.memoryReservation || null,
			ulimitsSwarm:
				formData.ulimitsSwarm && formData.ulimitsSwarm.length > 0
					? formData.ulimitsSwarm
					: null,
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
				<CardTitle className="text-xl">{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">{t("alertRedeploy")}</AlertBlock>
				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<div className="grid w-full md:grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="memoryLimit"
								render={({ field }) => {
									return (
										<FormItem>
											<div
												className="flex items-center gap-2"
												onClick={(e) => e.preventDefault()}
											>
												<FormLabel>{t("memoryLimit")}</FormLabel>
												<TooltipProvider>
													<Tooltip delayDuration={0}>
														<TooltipTrigger>
															<InfoIcon className="h-4 w-4 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent>
															<p>{t("tooltip.memoryLimit")}</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>
											<FormControl>
												<NumberInputWithSteps
													value={field.value}
													onChange={field.onChange}
													placeholder={t("placeholder.memoryLimit")}
													step={MEMORY_STEP_MB}
													converter={memoryConverter}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="memoryReservation"
								render={({ field }) => (
									<FormItem>
										<div
											className="flex items-center gap-2"
											onClick={(e) => e.preventDefault()}
										>
											<FormLabel>{t("memoryReservation")}</FormLabel>
											<TooltipProvider>
												<Tooltip delayDuration={0}>
													<TooltipTrigger>
														<InfoIcon className="h-4 w-4 text-muted-foreground" />
													</TooltipTrigger>
													<TooltipContent>
														<p>{t("tooltip.memoryReservation")}</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
										<FormControl>
											<NumberInputWithSteps
												value={field.value}
												onChange={field.onChange}
												placeholder={t("placeholder.memoryReservation")}
												step={MEMORY_STEP_MB}
												converter={memoryConverter}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="cpuLimit"
								render={({ field }) => {
									return (
										<FormItem>
											<div
												className="flex items-center gap-2"
												onClick={(e) => e.preventDefault()}
											>
												<FormLabel>{t("cpuLimit")}</FormLabel>
												<TooltipProvider>
													<Tooltip delayDuration={0}>
														<TooltipTrigger>
															<InfoIcon className="h-4 w-4 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent>
															<p>{t("tooltip.cpuLimit")}</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>
											<FormControl>
												<NumberInputWithSteps
													value={field.value}
													onChange={field.onChange}
													placeholder={t("placeholder.cpuLimit")}
													step={CPU_STEP}
													converter={cpuConverter}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="cpuReservation"
								render={({ field }) => {
									return (
										<FormItem>
											<div
												className="flex items-center gap-2"
												onClick={(e) => e.preventDefault()}
											>
												<FormLabel>{t("cpuReservation")}</FormLabel>
												<TooltipProvider>
													<Tooltip delayDuration={0}>
														<TooltipTrigger>
															<InfoIcon className="h-4 w-4 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent>
															<p>{t("tooltip.cpuReservation")}</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>
											<FormControl>
												<NumberInputWithSteps
													value={field.value}
													onChange={field.onChange}
													placeholder={t("placeholder.cpuReservation")}
													step={CPU_STEP}
													converter={cpuConverter}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
						</div>

						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<FormLabel className="text-base">
										{t("ulimits.label")}
									</FormLabel>
									<TooltipProvider>
										<Tooltip delayDuration={0}>
											<TooltipTrigger>
												<InfoIcon className="h-4 w-4 text-muted-foreground" />
											</TooltipTrigger>
											<TooltipContent className="max-w-xs">
												<p>{t("tooltip.ulimits")}</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										append({ Name: "nofile", Soft: 65535, Hard: 65535 })
									}
								>
									<Plus className="h-4 w-4 mr-1" />
									{t("ulimits.add")}
								</Button>
							</div>

							{fields.length > 0 && (
								<div className="space-y-3">
									{fields.map((field, index) => (
										<div
											key={field.id}
											className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30"
										>
											<FormField
												control={form.control}
												name={`ulimitsSwarm.${index}.Name`}
												render={({ field: nameField }) => (
													<FormItem className="flex-1">
														<FormLabel className="text-xs">
															{t("ulimits.type")}
														</FormLabel>
														<Select
															onValueChange={nameField.onChange}
															value={nameField.value}
														>
															<FormControl>
																<SelectTrigger>
																	<SelectValue
																		placeholder={t("ulimits.selectPlaceholder")}
																	/>
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																{ulimitPresets.map((preset) => (
																	<SelectItem
																		key={preset.value}
																		value={preset.value}
																	>
																		{preset.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name={`ulimitsSwarm.${index}.Soft`}
												render={({ field: softField }) => (
													<FormItem className="w-32">
														<FormLabel className="text-xs">
															{t("ulimits.softLimit")}
														</FormLabel>
														<FormControl>
															<Input
																type="number"
																min={-1}
																placeholder="65535"
																{...softField}
																value={
																	typeof softField.value === "number"
																		? softField.value
																		: ""
																}
																onChange={(e) =>
																	softField.onChange(Number(e.target.value))
																}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name={`ulimitsSwarm.${index}.Hard`}
												render={({ field: hardField }) => (
													<FormItem className="w-32">
														<FormLabel className="text-xs">
															{t("ulimits.hardLimit")}
														</FormLabel>
														<FormControl>
															<Input
																type="number"
																min={-1}
																placeholder="65535"
																{...hardField}
																value={
																	typeof hardField.value === "number"
																		? hardField.value
																		: ""
																}
																onChange={(e) =>
																	hardField.onChange(Number(e.target.value))
																}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="mt-6 text-destructive hover:text-destructive"
												onClick={() => remove(index)}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
							)}

							{fields.length === 0 && (
								<p className="text-sm text-muted-foreground">
									{t("ulimits.emptyHint")}
								</p>
							)}
						</div>

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
