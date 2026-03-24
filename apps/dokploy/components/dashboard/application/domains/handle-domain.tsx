import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { DatabaseZap, Dices, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { Input, NumberInput } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

export type CacheType = "fetch" | "cache";

const createDomainSchema = (
	t: ReturnType<typeof useTranslations<"applicationDomains">>,
) =>
	z
		.object({
			host: z
				.string()
				.min(1, { message: t("validation.hostRequired") })
				.refine((val) => val === val.trim(), {
					message: t("validation.hostTrim"),
				})
				.transform((val) => val.trim()),
			path: z.string().min(1).optional(),
			internalPath: z.string().optional(),
			stripPath: z.boolean().optional(),
			port: z
				.number()
				.min(1, { message: t("validation.portMin") })
				.max(65535, { message: t("validation.portMax") })
				.optional(),
			https: z.boolean().optional(),
			certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
			customCertResolver: z.string().optional(),
			serviceName: z.string().optional(),
			domainType: z.enum(["application", "compose", "preview"]).optional(),
		})
		.superRefine((input, ctx) => {
			if (input.https && !input.certificateType) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["certificateType"],
					message: t("validation.required"),
				});
			}

			if (input.certificateType === "custom" && !input.customCertResolver) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["customCertResolver"],
					message: t("validation.required"),
				});
			}

			if (input.domainType === "compose" && !input.serviceName) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["serviceName"],
					message: t("validation.required"),
				});
			}

			if (input.stripPath && (!input.path || input.path === "/")) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["stripPath"],
					message: t("validation.stripPathRequiresPath"),
				});
			}

			if (
				input.internalPath &&
				input.internalPath !== "/" &&
				!input.internalPath.startsWith("/")
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["internalPath"],
					message: t("validation.internalPathSlash"),
				});
			}
		});

type Domain = z.infer<ReturnType<typeof createDomainSchema>>;

interface Props {
	id: string;
	type: "application" | "compose";
	domainId?: string;
	children: React.ReactNode;
}

export const AddDomain = ({ id, type, domainId = "", children }: Props) => {
	const t = useTranslations("applicationDomains");
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const [isManualInput, setIsManualInput] = useState(false);

	const domainSchema = useMemo(() => createDomainSchema(t), [t]);

	const utils = api.useUtils();
	const { data, refetch } = api.domain.one.useQuery(
		{
			domainId,
		},
		{
			enabled: !!domainId,
		},
	);

	const { data: application } =
		type === "application"
			? api.application.one.useQuery(
					{
						applicationId: id,
					},
					{
						enabled: !!id,
					},
				)
			: api.compose.one.useQuery(
					{
						composeId: id,
					},
					{
						enabled: !!id,
					},
				);

	const { mutateAsync, isError, error, isPending } = domainId
		? api.domain.update.useMutation()
		: api.domain.create.useMutation();

	const { mutateAsync: generateDomain, isPending: isLoadingGenerate } =
		api.domain.generateDomain.useMutation();

	const { data: canGenerateTraefikMeDomains } =
		api.domain.canGenerateTraefikMeDomains.useQuery({
			serverId: application?.serverId || "",
		});

	const {
		data: services,
		isFetching: isLoadingServices,
		error: errorServices,
		refetch: refetchServices,
	} = api.compose.loadServices.useQuery(
		{
			composeId: id,
			type: cacheType,
		},
		{
			retry: false,
			refetchOnWindowFocus: false,
			enabled: type === "compose" && !!id,
		},
	);

	const form = useForm<Domain>({
		resolver: zodResolver(domainSchema),
		defaultValues: {
			host: "",
			path: undefined,
			internalPath: undefined,
			stripPath: false,
			port: undefined,
			https: false,
			certificateType: undefined,
			customCertResolver: undefined,
			serviceName: undefined,
			domainType: type,
		},
		mode: "onChange",
	});

	const certificateType = form.watch("certificateType");
	const https = form.watch("https");
	const domainType = form.watch("domainType");
	const host = form.watch("host");
	const isTraefikMeDomain = host?.includes("traefik.me") || false;

	useEffect(() => {
		if (data) {
			form.reset({
				...data,
				/* Convert null to undefined */
				path: data?.path || undefined,
				internalPath: data?.internalPath || undefined,
				stripPath: data?.stripPath || false,
				port: data?.port || undefined,
				certificateType: data?.certificateType || undefined,
				customCertResolver: data?.customCertResolver || undefined,
				serviceName: data?.serviceName || undefined,
				domainType: data?.domainType || type,
			});
		}

		if (!domainId) {
			form.reset({
				host: "",
				path: undefined,
				internalPath: undefined,
				stripPath: false,
				port: undefined,
				https: false,
				certificateType: undefined,
				customCertResolver: undefined,
				domainType: type,
			});
		}
	}, [form, data, isPending, domainId]);

	// Separate effect for handling custom cert resolver validation
	useEffect(() => {
		if (certificateType === "custom") {
			form.trigger("customCertResolver");
		}
	}, [certificateType, form]);

	const onSubmit = async (data: Domain) => {
		await mutateAsync({
			domainId,
			...(data.domainType === "application" && {
				applicationId: id,
			}),
			...(data.domainType === "compose" && {
				composeId: id,
			}),
			...data,
		})
			.then(async () => {
				toast.success(
					domainId
						? t("form.toastUpdateSuccess")
						: t("form.toastCreateSuccess"),
				);

				if (data.domainType === "application") {
					await utils.domain.byApplicationId.invalidate({
						applicationId: id,
					});
					await utils.application.readTraefikConfig.invalidate({
						applicationId: id,
					});
				} else if (data.domainType === "compose") {
					await utils.domain.byComposeId.invalidate({
						composeId: id,
					});
				}

				if (domainId) {
					refetch();
				}
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					domainId ? t("form.toastUpdateError") : t("form.toastCreateError"),
				);
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("form.dialogTitle")}</DialogTitle>
					<DialogDescription>
						{domainId
							? t("form.dialogDescriptionEdit")
							: t("form.dialogDescriptionCreate")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				{type === "compose" && (
					<AlertBlock type="info" className="mb-4">
						{t("form.composeRedeployAlert")}
					</AlertBlock>
				)}

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<div className="flex flex-row items-end w-full gap-4">
									{domainType === "compose" && (
										<div className="flex flex-col gap-2 w-full">
											{errorServices && (
												<AlertBlock
													type="warning"
													className="[overflow-wrap:anywhere]"
												>
													{errorServices?.message}
												</AlertBlock>
											)}
											<FormField
												control={form.control}
												name="serviceName"
												render={({ field }) => (
													<FormItem className="w-full">
														<FormLabel>{t("form.serviceName")}</FormLabel>
														<div className="flex gap-2">
															{isManualInput ? (
																<FormControl>
																	<Input
																		placeholder={t(
																			"form.servicePlaceholderManual",
																		)}
																		{...field}
																		className="w-full"
																	/>
																</FormControl>
															) : (
																<Select
																	onValueChange={field.onChange}
																	defaultValue={field.value || ""}
																>
																	<FormControl>
																		<SelectTrigger>
																			<SelectValue
																				placeholder={t(
																					"form.servicePlaceholderSelect",
																				)}
																			/>
																		</SelectTrigger>
																	</FormControl>

																	<SelectContent>
																		{services?.map((service, index) => (
																			<SelectItem
																				value={service}
																				key={`${service}-${index}`}
																			>
																				{service}
																			</SelectItem>
																		))}
																		<SelectItem value="none" disabled>
																			{t("form.serviceEmpty")}
																		</SelectItem>
																	</SelectContent>
																</Select>
															)}
															{!isManualInput && (
																<>
																	<TooltipProvider delayDuration={0}>
																		<Tooltip>
																			<TooltipTrigger asChild>
																				<Button
																					variant="secondary"
																					type="button"
																					isLoading={isLoadingServices}
																					onClick={() => {
																						if (cacheType === "fetch") {
																							refetchServices();
																						} else {
																							setCacheType("fetch");
																						}
																					}}
																				>
																					<RefreshCw className="size-4 text-muted-foreground" />
																				</Button>
																			</TooltipTrigger>
																			<TooltipContent
																				side="left"
																				sideOffset={5}
																				className="max-w-[10rem]"
																			>
																				<p>{t("form.fetchTooltip")}</p>
																			</TooltipContent>
																		</Tooltip>
																	</TooltipProvider>
																	<TooltipProvider delayDuration={0}>
																		<Tooltip>
																			<TooltipTrigger asChild>
																				<Button
																					variant="secondary"
																					type="button"
																					isLoading={isLoadingServices}
																					onClick={() => {
																						if (cacheType === "cache") {
																							refetchServices();
																						} else {
																							setCacheType("cache");
																						}
																					}}
																				>
																					<DatabaseZap className="size-4 text-muted-foreground" />
																				</Button>
																			</TooltipTrigger>
																			<TooltipContent
																				side="left"
																				sideOffset={5}
																				className="max-w-[10rem]"
																			>
																				<p>{t("form.cacheTooltip")}</p>
																			</TooltipContent>
																		</Tooltip>
																	</TooltipProvider>
																</>
															)}
															<TooltipProvider delayDuration={0}>
																<Tooltip>
																	<TooltipTrigger asChild>
																		<Button
																			variant="secondary"
																			type="button"
																			onClick={() => {
																				setIsManualInput(!isManualInput);
																				if (!isManualInput) {
																					field.onChange("");
																				}
																			}}
																		>
																			{isManualInput ? (
																				<RefreshCw className="size-4 text-muted-foreground" />
																			) : (
																				<span className="text-xs text-muted-foreground">
																					{t("form.manualShort")}
																				</span>
																			)}
																		</Button>
																	</TooltipTrigger>
																	<TooltipContent
																		side="left"
																		sideOffset={5}
																		className="max-w-[10rem]"
																	>
																		<p>
																			{isManualInput
																				? t("form.manualSwitchToSelect")
																				: t("form.manualEnterName")}
																		</p>
																	</TooltipContent>
																</Tooltip>
															</TooltipProvider>
														</div>

														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
									)}
								</div>
								<FormField
									control={form.control}
									name="host"
									render={({ field }) => (
										<FormItem>
											{!canGenerateTraefikMeDomains &&
												field.value.includes("traefik.me") && (
													<AlertBlock type="warning">
														{application?.serverId
															? t.rich("form.traefikIpAlertRemoteRich", {
																	link: (chunks) => (
																		<Link
																			href="/dashboard/settings/server"
																			className="text-primary"
																		>
																			{chunks}
																		</Link>
																	),
																})
															: t.rich("form.traefikIpAlertWebRich", {
																	link: (chunks) => (
																		<Link
																			href="/dashboard/settings/server"
																			className="text-primary"
																		>
																			{chunks}
																		</Link>
																	),
																})}
													</AlertBlock>
												)}
											{isTraefikMeDomain && (
												<AlertBlock type="info">
													{t("form.traefikMeInfo")}
												</AlertBlock>
											)}
											<FormLabel>{t("form.host")}</FormLabel>
											<div className="flex gap-2">
												<FormControl>
													<Input
														placeholder={t("form.hostPlaceholder")}
														{...field}
													/>
												</FormControl>
												<TooltipProvider delayDuration={0}>
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																variant="secondary"
																type="button"
																isLoading={isLoadingGenerate}
																onClick={() => {
																	generateDomain({
																		appName: application?.appName || "",
																		serverId: application?.serverId || "",
																	})
																		.then((domain) => {
																			field.onChange(domain);
																		})
																		.catch((err) => {
																			toast.error(err.message);
																		});
																}}
															>
																<Dices className="size-4 text-muted-foreground" />
															</Button>
														</TooltipTrigger>
														<TooltipContent
															side="left"
															sideOffset={5}
															className="max-w-[10rem]"
														>
															<p>{t("form.generateDomainTooltip")}</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>

											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="path"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>{t("form.path")}</FormLabel>
												<FormControl>
													<Input placeholder={"/"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="internalPath"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>{t("form.internalPath")}</FormLabel>
												<FormDescription>
													{t("form.internalPathDesc")}
												</FormDescription>
												<FormControl>
													<Input placeholder={"/"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="stripPath"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>{t("form.stripPath")}</FormLabel>
												<FormDescription>
													{t("form.stripPathDesc")}
												</FormDescription>
												<FormMessage />
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="port"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>{t("form.containerPort")}</FormLabel>
												<FormDescription>
													{t("form.containerPortDesc")}
												</FormDescription>
												<FormControl>
													<NumberInput placeholder={"3000"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="https"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>{t("form.https")}</FormLabel>
												<FormDescription>{t("form.httpsDesc")}</FormDescription>
												<FormMessage />
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								{https && (
									<>
										<FormField
											control={form.control}
											name="certificateType"
											render={({ field }) => {
												return (
													<FormItem>
														<FormLabel>
															{t("form.certificateProvider")}
														</FormLabel>
														<Select
															onValueChange={(value) => {
																field.onChange(value);
																if (value !== "custom") {
																	form.setValue(
																		"customCertResolver",
																		undefined,
																	);
																}
															}}
															value={field.value}
														>
															<FormControl>
																<SelectTrigger>
																	<SelectValue
																		placeholder={t(
																			"form.certificatePlaceholder",
																		)}
																	/>
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																<SelectItem value={"none"}>
																	{t("form.certNone")}
																</SelectItem>
																<SelectItem value={"letsencrypt"}>
																	{t("form.certLetsencrypt")}
																</SelectItem>
																<SelectItem value={"custom"}>
																	{t("form.certCustom")}
																</SelectItem>
															</SelectContent>
														</Select>
														<FormMessage />
													</FormItem>
												);
											}}
										/>

										{certificateType === "custom" && (
											<FormField
												control={form.control}
												name="customCertResolver"
												render={({ field }) => {
													return (
														<FormItem>
															<FormLabel>
																{t("form.customCertResolver")}
															</FormLabel>
															<FormControl>
																<Input
																	className="w-full"
																	placeholder={t("form.customCertPlaceholder")}
																	{...field}
																	value={field.value || ""}
																	onChange={(e) => {
																		field.onChange(e);
																		form.trigger("customCertResolver");
																	}}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													);
												}}
											/>
										)}
									</>
								)}
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button isLoading={isPending} form="hook-form" type="submit">
							{domainId ? t("form.submitUpdate") : t("form.submitCreate")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
