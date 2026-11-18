import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { InfoIcon, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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

const cpuConverter = createConverter(1_000_000_000, (cpu) =>
	cpu <= 0 ? "" : `${formatNumber(cpu)} CPU`,
);

const memoryConverter = createConverter(1024 * 1024, (mb) => {
	if (mb <= 0) return "";
	return mb >= 1024
		? `${formatNumber(mb / 1024)} GB`
		: `${formatNumber(mb)} MB`;
});

const ulimitSchema = z.object({
	Name: z.string().min(1, "application.resourceLimits.nameRequired"),
	Soft: z.coerce
		.number()
		.int()
		.min(-1, "application.resourceLimits.minusOneMin"),
	Hard: z.coerce
		.number()
		.int()
		.min(-1, "application.resourceLimits.minusOneMin"),
});

const addResourcesSchema = z.object({
	memoryReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	ulimitsSwarm: z.array(ulimitSchema).optional(),
});

const ULIMIT_PRESETS = [
	{ value: "nofile", label: "application.resourceLimits.ulimitNofile" },
	{ value: "nproc", label: "application.resourceLimits.ulimitNproc" },
	{ value: "memlock", label: "application.resourceLimits.ulimitMemlock" },
	{ value: "stack", label: "application.resourceLimits.ulimitStack" },
	{ value: "core", label: "application.resourceLimits.ulimitCore" },
	{ value: "cpu", label: "application.resourceLimits.ulimitCpu" },
	{ value: "data", label: "application.resourceLimits.ulimitData" },
	{ value: "fsize", label: "application.resourceLimits.ulimitFsize" },
	{ value: "locks", label: "application.resourceLimits.ulimitLocks" },
	{ value: "msgqueue", label: "application.resourceLimits.ulimitMsgqueue" },
	{ value: "nice", label: "application.resourceLimits.ulimitNice" },
	{ value: "rtprio", label: "application.resourceLimits.ulimitRtprio" },
	{ value: "sigpending", label: "application.resourceLimits.ulimitSigpending" },
];

export type ServiceType =
	| "application"
	| "libsql"
	| "mariadb"
	| "mongo"
	| "mysql"
	| "postgres"
	| "redis";

interface Props {
	id: string;
	type: ServiceType | "application";
}

type AddResources = z.infer<typeof addResourcesSchema>;

export const ShowResources = ({ id, type }: Props) => {
	const { t } = useTranslation();
	const queryMap = {
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		libsql: () => api.libsql.one.useQuery({ libsqlId: id }, { enabled: !!id }),
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
				ulimitsSwarm: (data as any)?.ulimitsSwarm || [],
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: AddResources) => {
		await mutateAsync({
			applicationId: id || "",
			libsqlId: id || "",
			mariadbId: id || "",
			mongoId: id || "",
			mysqlId: id || "",
			postgresId: id || "",
			redisId: id || "",
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
				toast.success(t("application.resourceLimits.updated"));
				await refetch();
			})
			.catch(() => {
				toast.error(t("application.resourceLimits.updateError"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">
					{t("application.resourceLimits.title")}
				</CardTitle>
				<CardDescription>
					{t("application.resourceLimits.description")}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					{t("application.resourceLimits.redeployHint")}
				</AlertBlock>
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
												<FormLabel>
													{t("application.resourceLimits.memoryLimit")}
												</FormLabel>
												<TooltipProvider>
													<Tooltip delayDuration={0}>
														<TooltipTrigger type="button">
															<InfoIcon className="h-4 w-4 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent>
															<p>
																{t(
																	"application.resourceLimits.memoryLimitTooltip",
																)}
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>
											<FormControl>
												<NumberInputWithSteps
													value={field.value}
													onChange={field.onChange}
													placeholder="1073741824 (1GB in bytes)"
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
											<FormLabel>
												{t("application.resourceLimits.memoryReservation")}
											</FormLabel>
											<TooltipProvider>
												<Tooltip delayDuration={0}>
													<TooltipTrigger type="button">
														<InfoIcon className="h-4 w-4 text-muted-foreground" />
													</TooltipTrigger>
													<TooltipContent>
														<p>
															{t(
																"application.resourceLimits.memoryReservationTooltip",
															)}
														</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
										<FormControl>
											<NumberInputWithSteps
												value={field.value}
												onChange={field.onChange}
												placeholder="268435456 (256MB in bytes)"
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
												<FormLabel>
													{t("application.resourceLimits.cpuLimit")}
												</FormLabel>
												<TooltipProvider>
													<Tooltip delayDuration={0}>
														<TooltipTrigger type="button">
															<InfoIcon className="h-4 w-4 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent>
															<p>
																{t(
																	"application.resourceLimits.cpuLimitTooltip",
																)}
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>
											<FormControl>
												<NumberInputWithSteps
													value={field.value}
													onChange={field.onChange}
													placeholder="2000000000 (2 CPUs)"
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
												<FormLabel>
													{t("application.resourceLimits.cpuReservation")}
												</FormLabel>
												<TooltipProvider>
													<Tooltip delayDuration={0}>
														<TooltipTrigger type="button">
															<InfoIcon className="h-4 w-4 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent>
															<p>
																{t(
																	"application.resourceLimits.cpuReservationTooltip",
																)}
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>
											<FormControl>
												<NumberInputWithSteps
													value={field.value}
													onChange={field.onChange}
													placeholder="1000000000 (1 CPU)"
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

						{/* Ulimits Section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<FormLabel className="text-base">
										{t("application.resourceLimits.ulimits")}
									</FormLabel>
									<TooltipProvider>
										<Tooltip delayDuration={0}>
											<TooltipTrigger type="button">
												<InfoIcon className="h-4 w-4 text-muted-foreground" />
											</TooltipTrigger>
											<TooltipContent className="max-w-xs">
												<p>{t("application.resourceLimits.ulimitsTooltip")}</p>
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
									{t("application.resourceLimits.addUlimit")}
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
												render={({ field }) => (
													<FormItem className="flex-1">
														<FormLabel className="text-xs">
															{t("application.resourceLimits.type")}
														</FormLabel>
														<Select
															onValueChange={field.onChange}
															value={field.value}
														>
															<FormControl>
																<SelectTrigger>
																	<SelectValue
																		placeholder={t(
																			"application.resourceLimits.selectUlimit",
																		)}
																	/>
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																{ULIMIT_PRESETS.map((preset) => (
																	<SelectItem
																		key={preset.value}
																		value={preset.value}
																	>
																		{t(preset.label)}
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
												render={({ field }) => (
													<FormItem className="w-32">
														<FormLabel className="text-xs">
															{t("application.resourceLimits.softLimit")}
														</FormLabel>
														<FormControl>
															<Input
																type="number"
																min={-1}
																placeholder="65535"
																{...field}
																value={
																	typeof field.value === "number"
																		? field.value
																		: ""
																}
																onChange={(e) =>
																	field.onChange(Number(e.target.value))
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
												render={({ field }) => (
													<FormItem className="w-32">
														<FormLabel className="text-xs">
															{t("application.resourceLimits.hardLimit")}
														</FormLabel>
														<FormControl>
															<Input
																type="number"
																min={-1}
																placeholder="65535"
																{...field}
																value={
																	typeof field.value === "number"
																		? field.value
																		: ""
																}
																onChange={(e) =>
																	field.onChange(Number(e.target.value))
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
									{t("application.resourceLimits.noUlimits")}
								</p>
							)}
						</div>

						<div className="flex w-full justify-end">
							<Button isLoading={isPending} type="submit">
								{t("application.resourceLimits.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
