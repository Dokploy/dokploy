import {
	INVALID_HOSTNAME_MESSAGE,
	VALID_HOSTNAME_REGEX,
} from "@dokploy/server/utils/hostname-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { DatabaseZap, Dices, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import z from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
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
import { COMPOSE_REDEPLOY_TOAST, ComposeRedeployAlert } from "./redeploy-hint";

export type CacheType = "fetch" | "cache";

export const domain = z
	.object({
		host: z
			.string()
			.min(1, { message: "application.domains.addHostname" })
			.refine((val) => val === val.trim(), {
				message: "application.domains.noSpaces",
			})
			.transform((val) => val.trim())
			.refine((val) => VALID_HOSTNAME_REGEX.test(val), {
				message: INVALID_HOSTNAME_MESSAGE,
			}),
		path: z.string().min(1).optional(),
		internalPath: z.string().optional(),
		stripPath: z.boolean().optional(),
		port: z
			.number()
			.min(1, { message: "application.domains.portMin" })
			.max(65535, { message: "application.domains.portMax" })
			.optional(),
		useCustomEntrypoint: z.boolean(),
		customEntrypoint: z.string().optional(),
		https: z.boolean().optional(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
		customCertResolver: z.string().optional(),
		serviceName: z.string().optional(),
		domainType: z.enum(["application", "compose", "preview"]).optional(),
		middlewares: z.array(z.string()).optional(),
	})
	.superRefine((input, ctx) => {
		if (input.https && !input.certificateType) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["certificateType"],
				message: "application.domains.required",
			});
		}

		if (input.certificateType === "custom" && !input.customCertResolver) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["customCertResolver"],
				message: "application.domains.required",
			});
		}

		if (input.domainType === "compose" && !input.serviceName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["serviceName"],
				message: "application.domains.required",
			});
		}

		// Validate stripPath requires a valid path
		if (input.stripPath && (!input.path || input.path === "/")) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["stripPath"],
				message: "application.domains.stripPathRequiresPath",
			});
		}

		// Validate internalPath starts with /
		if (
			input.internalPath &&
			input.internalPath !== "/" &&
			!input.internalPath.startsWith("/")
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["internalPath"],
				message: "application.domains.internalPathMustStartWithSlash",
			});
		}

		if (input.useCustomEntrypoint && !input.customEntrypoint) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["customEntrypoint"],
				message: "application.domains.entrypointRequired",
			});
		}
	});

type Domain = z.infer<typeof domain>;

interface Props {
	id: string;
	type: "application" | "compose";
	domainId?: string;
	children: React.ReactNode;
}

export const AddDomain = ({ id, type, domainId = "", children }: Props) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const [isManualInput, setIsManualInput] = useState(false);

	const utils = api.useUtils();
	const { data, refetch } = api.domain.one.useQuery(
		{
			domainId,
		},
		{
			enabled: isOpen && !!domainId,
		},
	);

	const { data: application } =
		type === "application"
			? api.application.one.useQuery(
					{
						applicationId: id,
					},
					{
						enabled: isOpen && !!id,
					},
				)
			: api.compose.one.useQuery(
					{
						composeId: id,
					},
					{
						enabled: isOpen && !!id,
					},
				);

	const { mutateAsync, isError, error, isPending } = domainId
		? api.domain.update.useMutation()
		: api.domain.create.useMutation();

	const { mutateAsync: generateDomain, isPending: isLoadingGenerate } =
		api.domain.generateDomain.useMutation();

	const { data: canGenerateTraefikMeDomains } =
		api.domain.canGenerateTraefikMeDomains.useQuery(
			{
				serverId: application?.serverId || "",
			},
			{
				enabled: isOpen,
			},
		);

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
			enabled: isOpen && type === "compose" && !!id,
		},
	);

	const form = useForm<Domain>({
		resolver: zodResolver(domain),
		defaultValues: {
			host: "",
			path: undefined,
			internalPath: undefined,
			stripPath: false,
			port: undefined,
			useCustomEntrypoint: false,
			customEntrypoint: undefined,
			https: false,
			certificateType: undefined,
			customCertResolver: undefined,
			serviceName: undefined,
			domainType: type,
			middlewares: [],
		},
		mode: "onChange",
	});

	const certificateType = form.watch("certificateType");
	const useCustomEntrypoint = form.watch("useCustomEntrypoint");
	const https = form.watch("https");
	const domainType = form.watch("domainType");
	const host = form.watch("host");
	const isTraefikMeDomain = host?.includes("sslip.io") || false;

	useEffect(() => {
		if (data) {
			form.reset({
				...data,
				/* Convert null to undefined */
				path: data?.path || undefined,
				internalPath: data?.internalPath || undefined,
				stripPath: data?.stripPath || false,
				port: data?.port || undefined,
				useCustomEntrypoint: !!data.customEntrypoint,
				customEntrypoint: data.customEntrypoint || undefined,
				certificateType: data?.certificateType || undefined,
				customCertResolver: data?.customCertResolver || undefined,
				serviceName: data?.serviceName || undefined,
				domainType: data?.domainType || type,
				middlewares: data?.middlewares || [],
			});
		}

		if (!domainId) {
			form.reset({
				host: "",
				path: undefined,
				internalPath: undefined,
				stripPath: false,
				port: undefined,
				useCustomEntrypoint: false,
				customEntrypoint: undefined,
				https: false,
				certificateType: undefined,
				customCertResolver: undefined,
				domainType: type,
				middlewares: [],
			});
		}
	}, [form, data, isPending, domainId]);

	// Separate effect for handling custom cert resolver validation
	useEffect(() => {
		if (certificateType === "custom") {
			form.trigger("customCertResolver");
		}
	}, [certificateType, form]);

	const dictionary = {
		success: domainId
			? t("application.domains.updated")
			: t("application.domains.created"),
		error: domainId
			? t("application.domains.updateError")
			: t("application.domains.createError"),
		submit: domainId
			? t("application.domains.update")
			: t("application.domains.create"),
		dialogDescription: domainId
			? t("application.domains.editDescription")
			: t("application.domains.addDescription"),
	};

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
			customEntrypoint: data.useCustomEntrypoint ? data.customEntrypoint : null,
		})
			.then(async () => {
				toast.success(
					dictionary.success,
					data.domainType === "compose"
						? { description: t(COMPOSE_REDEPLOY_TOAST) }
						: undefined,
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
			.catch((e) => {
				console.log(e);
				toast.error(dictionary.error);
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("application.domains.title")}</DialogTitle>
					<DialogDescription>{dictionary.dialogDescription}</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				{type === "compose" && <ComposeRedeployAlert className="mb-4" />}

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
												<AlertBlock type="warning" className="wrap-anywhere">
													{errorServices?.message}
												</AlertBlock>
											)}
											<FormField
												control={form.control}
												name="serviceName"
												render={({ field }) => (
													<FormItem className="w-full">
														<FormLabel>
															{t("application.domains.serviceName")}
														</FormLabel>
														<div className="flex gap-2">
															{isManualInput ? (
																<FormControl>
																	<Input
																		placeholder={t(
																			"application.domains.enterServiceName",
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
																					"application.domains.selectServiceName",
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
																			{t("application.domains.empty")}
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
																				className="max-w-40"
																			>
																				<p>
																					{t(
																						"application.domains.fetchTooltip",
																					)}
																				</p>
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
																				className="max-w-40"
																			>
																				<p>
																					{t(
																						"application.domains.cacheTooltip",
																					)}
																				</p>
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
																					{t("application.domains.manual")}
																				</span>
																			)}
																		</Button>
																	</TooltipTrigger>
																	<TooltipContent
																		side="left"
																		sideOffset={5}
																		className="max-w-40"
																	>
																		<p>
																			{isManualInput
																				? t(
																						"application.domains.switchToSelect",
																					)
																				: t(
																						"application.domains.enterServiceName",
																					)}
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
												field.value.includes("sslip.io") && (
													<AlertBlock type="warning">
														{t("application.domains.setIpAddressPrefix")}{" "}
														<Link
															href="/dashboard/settings/server"
															className="text-primary"
														>
															{application?.serverId
																? t("application.domains.remoteServersPath")
																: t("application.domains.webServerPath")}
														</Link>{" "}
														{t("application.domains.setIpAddressSuffix")}
													</AlertBlock>
												)}
											{isTraefikMeDomain && (
												<AlertBlock type="info">
													<strong>{t("application.domains.note")}</strong>{" "}
													{t("application.domains.sslipNote")}
												</AlertBlock>
											)}
											<FormLabel>{t("application.domains.host")}</FormLabel>
											<div className="flex gap-2">
												<FormControl>
													<Input placeholder="api.dokploy.com" {...field} />
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
															className="max-w-40"
														>
															<p>{t("application.domains.generateDomain")}</p>
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
												<FormLabel>{t("application.domains.path")}</FormLabel>
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
												<FormLabel>
													{t("application.domains.internalPath")}
												</FormLabel>
												<FormDescription>
													{t("application.domains.internalPathDescription")}
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
										<FormItem className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-xs">
											<div className="space-y-0.5">
												<FormLabel>
													{t("application.domains.stripPath")}
												</FormLabel>
												<FormDescription>
													{t("application.domains.stripPathDescription")}
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
												<FormLabel>
													{t("application.domains.containerPort")}
												</FormLabel>
												<FormDescription>
													{t("application.domains.containerPortDescription")}
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
									name="useCustomEntrypoint"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-xs">
											<div className="space-y-0.5">
												<FormLabel>
													{t("application.domains.customEntrypoint")}
												</FormLabel>
												<FormDescription>
													{t("application.domains.customEntrypointDescription")}
													<br />
													{t("application.domains.customEntrypointDefault")}
												</FormDescription>
												<FormMessage />
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={(checked) => {
														field.onChange(checked);
														if (!checked) {
															form.setValue("customEntrypoint", undefined);
														}
													}}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								{useCustomEntrypoint && (
									<FormField
										control={form.control}
										name="customEntrypoint"
										render={({ field }) => (
											<FormItem className="w-full">
												<FormLabel>
													{t("application.domains.entrypointName")}
												</FormLabel>
												<FormControl>
													<Input
														placeholder={t(
															"application.domains.enterEntrypointName",
														)}
														{...field}
														className="w-full"
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								<FormField
									control={form.control}
									name="https"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-xs">
											<div className="space-y-0.5">
												<FormLabel>{t("application.domains.https")}</FormLabel>
												<FormDescription>
													{t("application.domains.httpsDescription")}
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

								{https && (
									<>
										<FormField
											control={form.control}
											name="certificateType"
											render={({ field }) => {
												return (
													<FormItem>
														<FormLabel>
															{t("application.domains.certificateProvider")}
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
																			"application.domains.selectCertificateProvider",
																		)}
																	/>
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																<SelectItem value={"none"}>
																	{t("application.domains.none")}
																</SelectItem>
																<SelectItem value={"letsencrypt"}>
																	Let's Encrypt
																</SelectItem>
																<SelectItem value={"custom"}>
																	{t("application.domains.custom")}
																</SelectItem>
															</SelectContent>
														</Select>
														<FormDescription>
															{field.value === "none" && (
																<>
																	<strong>
																		{t("application.domains.none")}
																	</strong>{" "}
																	{t("application.domains.noneCertDescription")}{" "}
																	<Link
																		href="/dashboard/settings/certificates"
																		className="text-primary"
																	>
																		{t("application.domains.certificates")}
																	</Link>{" "}
																	{t(
																		"application.domains.noneCertDescriptionSuffix",
																	)}
																</>
															)}
															{field.value === "letsencrypt" && (
																<>
																	<strong>Let's Encrypt</strong>{" "}
																	{t(
																		"application.domains.letsencryptDescription",
																	)}
																</>
															)}
															{field.value === "custom" && (
																<>
																	<strong>
																		{t("application.domains.custom")}
																	</strong>{" "}
																	{t(
																		"application.domains.customCertDescription",
																	)}
																</>
															)}
															{!field.value &&
																t("application.domains.selectProviderHint")}
														</FormDescription>
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
																{t("application.domains.customCertResolver")}
															</FormLabel>
															<FormDescription>
																{t(
																	"application.domains.customCertResolverDescription",
																)}
															</FormDescription>
															<FormControl>
																<Input
																	className="w-full"
																	placeholder="e.g. letsencrypt"
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
								<FormField
									control={form.control}
									name="middlewares"
									render={({ field }) => (
										<FormItem>
											<div className="flex items-center gap-2">
												<FormLabel>
													{t("application.domains.middlewares")}
												</FormLabel>
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger type="button">
															<div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
																?
															</div>
														</TooltipTrigger>
														<TooltipContent className="max-w-[300px]">
															<p>
																{t("application.domains.middlewaresTooltip")}
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>
											<div className="flex flex-wrap gap-2 mb-2">
												{field.value?.map((name, index) => (
													<Badge key={index} variant="secondary">
														{name}
														<X
															className="ml-1 size-3 cursor-pointer"
															onClick={() => {
																const newMiddlewares = [...(field.value || [])];
																newMiddlewares.splice(index, 1);
																form.setValue("middlewares", newMiddlewares);
															}}
														/>
													</Badge>
												))}
											</div>
											<FormControl>
												<div className="flex gap-2">
													<Input
														placeholder={t(
															"application.domains.middlewaresPlaceholder",
														)}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																const input = e.currentTarget;
																const value = input.value.trim();
																if (value && !field.value?.includes(value)) {
																	form.setValue("middlewares", [
																		...(field.value || []),
																		value,
																	]);
																	input.value = "";
																}
															}
														}}
													/>
													<Button
														type="button"
														variant="secondary"
														onClick={() => {
															const input = document.querySelector(
																`input[placeholder="${t("application.domains.middlewaresPlaceholder")}"]`,
															) as HTMLInputElement;
															const value = input.value.trim();
															if (value && !field.value?.includes(value)) {
																form.setValue("middlewares", [
																	...(field.value || []),
																	value,
																]);
																input.value = "";
															}
														}}
													>
														{t("application.domains.add")}
													</Button>
												</div>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button isLoading={isPending} form="hook-form" type="submit">
							{dictionary.submit}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
