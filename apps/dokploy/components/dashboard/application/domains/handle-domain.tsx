import { zodResolver } from "@hookform/resolvers/zod";
import { DatabaseZap, Dices, RefreshCw } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
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

export const domain = (t: (key: string, opts?: Record<string, unknown>) => string) =>
	z
		.object({
			host: z
				.string()
				.min(1, { message: t("application.domains.validation.hostRequired") })
				.refine((val) => val === val.trim(), {
					message: t(
						"application.domains.validation.hostNoLeadingTrailingSpaces",
					),
				})
				.transform((val) => val.trim()),
			path: z.string().min(1).optional(),
			internalPath: z.string().optional(),
			stripPath: z.boolean().optional(),
			port: z
				.number()
				.min(1, {
					message: t("application.domains.validation.portMin"),
				})
				.max(65535, {
					message: t("application.domains.validation.portMax"),
				})
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
					message: t("application.domains.validation.required"),
				});
			}

			if (input.certificateType === "custom" && !input.customCertResolver) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["customCertResolver"],
					message: t("application.domains.validation.required"),
				});
			}

			if (input.domainType === "compose" && !input.serviceName) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["serviceName"],
					message: t("application.domains.validation.required"),
				});
			}

			// Validate stripPath requires a valid path
			if (input.stripPath && (!input.path || input.path === "/")) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["stripPath"],
					message: t(
						"application.domains.validation.stripPathWithValidPath",
					),
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
					message: t(
						"application.domains.validation.internalPathStartsWithSlash",
					),
				});
			}
		});

type Domain = z.infer<ReturnType<typeof domain>>;

interface Props {
	id: string;
	type: "application" | "compose";
	domainId?: string;
	children: React.ReactNode;
}

export const AddDomain = ({ id, type, domainId = "", children }: Props) => {
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const [isManualInput, setIsManualInput] = useState(false);

	const domainSchema = domain(t);

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

	const { mutateAsync, isError, error, isLoading } = domainId
		? api.domain.update.useMutation()
		: api.domain.create.useMutation();

	const { mutateAsync: generateDomain, isLoading: isLoadingGenerate } =
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
	}, [form, data, isLoading, domainId]);

	// Separate effect for handling custom cert resolver validation
	useEffect(() => {
		if (certificateType === "custom") {
			form.trigger("customCertResolver");
		}
	}, [certificateType, form]);

	const dictionary = {
		success: domainId
			? t("application.domains.handle.toast.update.success")
			: t("application.domains.handle.toast.create.success"),
		error: domainId
			? t("application.domains.handle.toast.update.error")
			: t("application.domains.handle.toast.create.error"),
		submit: domainId
			? t("application.domains.handle.button.update")
			: t("application.domains.handle.button.create"),
		dialogDescription: domainId
			? t("application.domains.handle.dialog.edit.description")
			: t("application.domains.handle.dialog.create.description"),
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
		})
			.then(async () => {
				toast.success(dictionary.success);

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
					<DialogTitle>
						{t("application.domains.handle.dialog.title")}
					</DialogTitle>
					<DialogDescription>{dictionary.dialogDescription}</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				{type === "compose" && (
					<AlertBlock type="info" className="mb-4">
						Whenever you make changes to domains, remember to redeploy your
						compose to apply the changes.
					</AlertBlock>
				)}

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-6"
					>
						<div className="flex flex-col gap-6">
							<div className="grid gap-4 md:grid-cols-2">
								<FormField
									control={form.control}
									name="host"
									render={({ field }) => (
										<FormItem className="md:col-span-2">
											<FormLabel>
												{t("application.domains.handle.field.host.label")}
											</FormLabel>
											<div className="flex flex-col gap-2">
												<div className="flex gap-2">
													<FormControl>
														<Input
															placeholder={t(
																"application.domains.handle.field.host.placeholder",
															)}
															{...field}
														/>
													</FormControl>
													{canGenerateTraefikMeDomains?.canGenerate && (
														<TooltipProvider delayDuration={0}>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		type="button"
																		variant="secondary"
																		isLoading={isLoadingGenerate}
																		onClick={() => {
																			generateDomain({
																				appName:
																					(application as any)?.appName ||
																					(application as any)?.name ||
																					"",
																				serverId: application?.serverId || "",
																			})
																				.then((generated) => {
																					field.onChange(generated);
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
																	className="max-w-[14rem]"
																>
																	<p>
																		{t(
																			"application.domains.handle.tooltip.generateTraefik",
																		)}
																	</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													)}
												</div>
												<FormMessage />
											</div>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="path"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("application.domains.handle.field.path.label")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"application.domains.handle.field.path.placeholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="internalPath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("application.domains.handle.field.internalPath.label")}
											</FormLabel>
											<FormDescription>
												{t(
													"application.domains.handle.field.internalPath.description",
												)}
											</FormDescription>
											<FormControl>
												<Input
													placeholder={t(
														"application.domains.handle.field.internalPath.placeholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="port"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("application.domains.handle.field.port.label")}
											</FormLabel>
											<FormDescription>
												{t("application.domains.handle.field.port.description")}
											</FormDescription>
											<FormControl>
												<NumberInput
													placeholder={t(
														"application.domains.handle.field.port.placeholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<FormField
									control={form.control}
									name="stripPath"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>
													{t("application.domains.handle.field.stripPath.label")}
												</FormLabel>
												<FormDescription>
													{t(
														"application.domains.handle.field.stripPath.description",
													)}
												</FormDescription>
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
									name="https"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>
													{t("application.domains.handle.field.https.label")}
												</FormLabel>
												<FormDescription>
													{t(
														"application.domains.handle.field.https.description",
													)}
												</FormDescription>
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
							</div>

							{https && (
								<FormField
									control={form.control}
									name="certificateType"
									render={({ field }) => (
										<FormItem className="md:col-span-2">
											<FormLabel>
												{t(
													"application.domains.handle.field.certificateType.label",
												)}
											</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"application.domains.handle.field.certificateType.placeholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="none">
														{t(
															"application.domains.handle.field.certificateType.option.none",
														)}
													</SelectItem>
													<SelectItem value="letsencrypt">
														{t(
															"application.domains.handle.field.certificateType.option.letsencrypt",
														)}
													</SelectItem>
													<SelectItem value="custom">
														{t(
															"application.domains.handle.field.certificateType.option.custom",
														)}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{certificateType === "custom" && (
								<FormField
									control={form.control}
									name="customCertResolver"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t(
													"application.domains.handle.field.customCertResolver.label",
												)}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t(
														"application.domains.handle.field.customCertResolver.placeholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{domainType === "compose" && (
								<div className="flex flex-col gap-3">
									<div className="flex items-center justify-between gap-2">
										<div className="space-y-1">
											<FormLabel>
												{t("application.domains.handle.field.serviceName.label")}
											</FormLabel>
											<FormDescription>
												{t("application.domains.handle.tooltip.switchToManual")}
											</FormDescription>
										</div>
										<div className="flex items-center gap-2">
											<TooltipProvider delayDuration={0}>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															type="button"
															size="icon"
															variant="ghost"
															onClick={() =>
																setCacheType(
																	cacheType === "cache" ? "fetch" : "cache",
																)
															}
														>
															<DatabaseZap className="size-4" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>
														<p>
															{cacheType === "cache"
																? t("application.domains.handle.tooltip.cache")
																: t("application.domains.handle.tooltip.fetch")}
														</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>

											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => refetchServices()}
												isLoading={isLoadingServices}
											>
												<RefreshCw className="size-4" />
											</Button>

											<TooltipProvider delayDuration={0}>
												<Tooltip>
													<TooltipTrigger asChild>
														<Switch
															checked={isManualInput}
															onCheckedChange={(checked) =>
																setIsManualInput(!!checked)
															}
														/>
													</TooltipTrigger>
													<TooltipContent side="left">
														<p>
															{isManualInput
																? t(
																		"application.domains.handle.tooltip.switchToSelect",
																	)
																: t(
																		"application.domains.handle.tooltip.switchToManual",
																	)}
														</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
									</div>

									{errorServices && (
										<AlertBlock type="error">{errorServices.message}</AlertBlock>
									)}

									<FormField
										control={form.control}
										name="serviceName"
										render={({ field }) =>
											isManualInput ? (
												<FormItem>
													<FormControl>
														<Input
															placeholder={t(
																"application.domains.handle.field.serviceName.manualPlaceholder",
															)}
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											) : (
												<FormItem>
													<Select
														onValueChange={field.onChange}
														value={field.value || ""}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue
																	placeholder={t(
																		"application.domains.handle.field.serviceName.manualPlaceholder",
																	)}
																/>
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{services?.length ? (
																services.map((service) => (
																	<SelectItem key={service} value={service}>
																		{service}
																	</SelectItem>
																))
															) : (
																<SelectItem value="" disabled>
																	{t(
																		"application.domains.handle.field.serviceName.empty",
																	)}
																</SelectItem>
															)}
														</SelectContent>
													</Select>
													<FormMessage />
												</FormItem>
											)
										}
									/>
								</div>
							)}
						</div>
					</form>

					<DialogFooter>
						<Button isLoading={isLoading} form="hook-form" type="submit">
							{dictionary.submit}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
