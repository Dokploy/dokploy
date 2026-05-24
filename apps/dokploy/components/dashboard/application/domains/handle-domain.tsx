import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { DatabaseZap, Dices, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

export type CacheType = "fetch" | "cache";

const accessRuleFormSchema = z
	.object({
		enabled: z.boolean().optional(),
		name: z.string().optional(),
		priority: z.number().int().min(1).max(1000).optional(),
		path: z.string().optional(),
		pathType: z.enum(["exact", "prefix", "regexp"]).optional(),
		matcherExpression: z.string().optional(),
		basicAuthUsername: z.string().optional(),
		basicAuthPassword: z.string().optional(),
		basicAuthConfigured: z.boolean().optional(),
		ipAllowList: z.array(z.string()).optional(),
		ipStrategyDepth: z.number().int().min(0).optional(),
		excludedIPs: z.array(z.string()).optional(),
	})
	.superRefine((input, ctx) => {
		if (
			input.path &&
			input.pathType !== "regexp" &&
			input.path !== "/" &&
			!input.path.startsWith("/")
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["path"],
				message: "Rule path must start with '/'",
			});
		}

		if (input.pathType === "regexp" && input.path) {
			try {
				new RegExp(input.path);
			} catch {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["path"],
					message: "Rule path must be a valid regular expression",
				});
			}
		}

		const hasBasicAuth =
			!!input.basicAuthUsername?.trim() || !!input.basicAuthPassword?.trim();
		const hasConfiguredBasicAuth =
			!!input.basicAuthUsername?.trim() && input.basicAuthConfigured === true;
		const hasIpAllowList = (input.ipAllowList || []).length > 0;

		if (hasBasicAuth && !input.basicAuthUsername?.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["basicAuthUsername"],
				message: "Username is required when basic auth is enabled",
			});
		}

		if (
			hasBasicAuth &&
			!input.basicAuthPassword?.trim() &&
			!hasConfiguredBasicAuth
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["basicAuthPassword"],
				message: "Password is required when basic auth is enabled",
			});
		}

		if (!hasBasicAuth && !hasConfiguredBasicAuth && !hasIpAllowList) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["basicAuthUsername"],
				message: "Add basic auth and/or IP allow list",
			});
		}
	});

type DomainAccessRule = z.infer<typeof accessRuleFormSchema>;

export const domain = z
	.object({
		host: z
			.string()
			.min(1, { message: "Add a hostname" })
			.refine((val) => val === val.trim(), {
				message: "Domain name cannot have leading or trailing spaces",
			})
			.transform((val) => val.trim()),
		path: z.string().min(1).optional(),
		internalPath: z.string().optional(),
		stripPath: z.boolean().optional(),
		port: z
			.number()
			.min(1, { message: "Port must be at least 1" })
			.max(65535, { message: "Port must be 65535 or below" })
			.optional(),
		useCustomEntrypoint: z.boolean(),
		customEntrypoint: z.string().optional(),
		https: z.boolean().optional(),
		certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
		customCertResolver: z.string().optional(),
		serviceName: z.string().optional(),
		domainType: z.enum(["application", "compose", "preview"]).optional(),
		middlewares: z.array(z.string()).optional(),
		accessRules: z.array(accessRuleFormSchema).optional(),
	})
	.superRefine((input, ctx) => {
		if (input.https && !input.certificateType) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["certificateType"],
				message: "Required",
			});
		}

		if (input.certificateType === "custom" && !input.customCertResolver) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["customCertResolver"],
				message: "Required",
			});
		}

		if (input.domainType === "compose" && !input.serviceName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["serviceName"],
				message: "Required",
			});
		}

		// Validate stripPath requires a valid path
		if (input.stripPath && (!input.path || input.path === "/")) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["stripPath"],
				message:
					"Strip path can only be enabled when a path other than '/' is specified",
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
				message: "Internal path must start with '/'",
			});
		}

		if (input.useCustomEntrypoint && !input.customEntrypoint) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["customEntrypoint"],
				message: "Custom entry point must be specified",
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
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const [isManualInput, setIsManualInput] = useState(false);

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
			accessRules: [],
		},
		mode: "onChange",
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "accessRules",
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
				accessRules:
					data?.accessRules?.map((rule) => ({
						...rule,
						basicAuthPassword: "",
						basicAuthConfigured: !!rule.basicAuthConfigured,
					})) || [],
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
				accessRules: [],
			});
		}
	}, [form, data, isPending, domainId]);

	const addAccessRule = () => {
		append({
			enabled: true,
			name: "",
			priority: 100,
			path: "/",
			pathType: "prefix",
			matcherExpression: "",
			basicAuthUsername: "",
			basicAuthPassword: "",
			basicAuthConfigured: false,
			ipAllowList: [],
			ipStrategyDepth: undefined,
			excludedIPs: [],
		});
	};

	const updateListField = (
		index: number,
		fieldName: "ipAllowList" | "excludedIPs",
		value: string,
	) => {
		const items = value
			.split(/\r?\n|,/)
			.map((item) => item.trim())
			.filter(Boolean);
		form.setValue(`accessRules.${index}.${fieldName}`, items, {
			shouldDirty: true,
			shouldValidate: true,
		});
	};

	// Separate effect for handling custom cert resolver validation
	useEffect(() => {
		if (certificateType === "custom") {
			form.trigger("customCertResolver");
		}
	}, [certificateType, form]);

	const dictionary = {
		success: domainId ? "Domain Updated" : "Domain Created",
		error: domainId ? "Error updating the domain" : "Error creating the domain",
		submit: domainId ? "Update" : "Create",
		dialogDescription: domainId
			? "In this section you can edit a domain"
			: "In this section you can add domains",
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

	const renderAccessRuleCard = (
		field: { id: string } & DomainAccessRule,
		index: number,
	) => (
		<div key={field.id} className="border rounded-lg p-4 space-y-4">
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="font-medium">Rule {index + 1}</p>
					<p className="text-sm text-muted-foreground">
						Match path and apply basic auth and/or IP allow list.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<FormField
						control={form.control}
						name={`accessRules.${index}.enabled`}
						render={({ field }) => (
							<Switch
								checked={field.value ?? true}
								onCheckedChange={field.onChange}
							/>
						)}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => remove(index)}
					>
						<X className="size-4" />
					</Button>
				</div>
			</div>

			<div className="grid md:grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name={`accessRules.${index}.name`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Name</FormLabel>
							<FormControl>
								<Input
									placeholder="Admin area"
									{...field}
									value={field.value || ""}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name={`accessRules.${index}.priority`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Priority</FormLabel>
							<FormControl>
								<NumberInput placeholder="100" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>

			<div className="grid md:grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name={`accessRules.${index}.pathType`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Path Match</FormLabel>
							<Select
								onValueChange={field.onChange}
								value={field.value || "prefix"}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select path match" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="prefix">Prefix</SelectItem>
									<SelectItem value="exact">Exact</SelectItem>
									<SelectItem value="regexp">Regex</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name={`accessRules.${index}.path`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Path</FormLabel>
							<FormControl>
								<Input
									placeholder={
										form.watch(`accessRules.${index}.pathType`) === "regexp"
											? "^/admin(/.*)?$"
											: "/admin"
									}
									{...field}
									value={field.value || ""}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>

			<FormField
				control={form.control}
				name={`accessRules.${index}.matcherExpression`}
				render={({ field }) => (
					<FormItem>
						<FormLabel>Advanced Matchers</FormLabel>
						<FormDescription>
							Optional Traefik matcher expression. Example:
							ClientIP(`10.0.0.0/8`) || Method(`POST`)
						</FormDescription>
						<FormControl>
							<Input
								placeholder="ClientIP(`10.0.0.0/8`)"
								{...field}
								value={field.value || ""}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<div className="grid md:grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name={`accessRules.${index}.basicAuthUsername`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Basic Auth Username</FormLabel>
							{form.watch(`accessRules.${index}.basicAuthConfigured`) && (
								<FormDescription>
									Password already configured. Enter new password only if you
									want to rotate it.
								</FormDescription>
							)}
							<FormControl>
								<Input
									placeholder="admin"
									{...field}
									value={field.value || ""}
									onChange={(event) => {
										field.onChange(event);
										form.setValue(
											`accessRules.${index}.basicAuthConfigured`,
											!!event.target.value &&
												!!form.getValues(
													`accessRules.${index}.basicAuthConfigured`,
												),
										);
									}}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name={`accessRules.${index}.basicAuthPassword`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Basic Auth Password</FormLabel>
							<FormDescription>
								Leave empty to keep existing password.
							</FormDescription>
							<FormControl>
								<Input
									type="password"
									placeholder="••••••••"
									{...field}
									value={field.value || ""}
									onChange={(event) => {
										field.onChange(event);
										if (event.target.value) {
											form.setValue(
												`accessRules.${index}.basicAuthConfigured`,
												true,
											);
										}
									}}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>

			<div className="grid md:grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name={`accessRules.${index}.ipAllowList`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>IP Allow List</FormLabel>
							<FormDescription>
								One CIDR or IP per line. Example: 192.168.1.0/24
							</FormDescription>
							<FormControl>
								<Textarea
									rows={4}
									value={(field.value || []).join("\n")}
									onChange={(event) =>
										updateListField(index, "ipAllowList", event.target.value)
									}
									placeholder={"192.168.1.0/24\n10.0.0.5/32"}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="space-y-4">
					<FormField
						control={form.control}
						name={`accessRules.${index}.ipStrategyDepth`}
						render={({ field }) => (
							<FormItem>
								<FormLabel>IP Strategy Depth</FormLabel>
								<FormDescription>
									Use forwarded IP depth when behind proxy.
								</FormDescription>
								<FormControl>
									<NumberInput placeholder="0" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name={`accessRules.${index}.excludedIPs`}
						render={({ field }) => (
							<FormItem>
								<FormLabel>Excluded Proxy IPs</FormLabel>
								<FormControl>
									<Textarea
										rows={3}
										value={(field.value || []).join("\n")}
										onChange={(event) =>
											updateListField(index, "excludedIPs", event.target.value)
										}
										placeholder={"10.0.0.1\n10.0.0.2"}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
			</div>
		</div>
	);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Domain</DialogTitle>
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
														<FormLabel>Service Name</FormLabel>
														<div className="flex gap-2">
															{isManualInput ? (
																<FormControl>
																	<Input
																		placeholder="Enter service name manually"
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
																			<SelectValue placeholder="Select a service name" />
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
																			Empty
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
																				<p>
																					Fetch: Will clone the repository and
																					load the services
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
																				className="max-w-[10rem]"
																			>
																				<p>
																					Cache: If you previously deployed this
																					compose, it will read the services
																					from the last deployment/fetch from
																					the repository
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
																					Manual
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
																				? "Switch to service selection"
																				: "Enter service name manually"}
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
														You need to set an IP address in your{" "}
														<Link
															href="/dashboard/settings/server"
															className="text-primary"
														>
															{application?.serverId
																? "Remote Servers -> Server -> Edit Server -> Update IP Address"
																: "Web Server -> Server -> Update Server IP"}
														</Link>{" "}
														to make your sslip.io domain work.
													</AlertBlock>
												)}
											{isTraefikMeDomain && (
												<AlertBlock type="info">
													<strong>Note:</strong> sslip.io is a public HTTP
													service and does not support SSL/HTTPS. HTTPS and
													certificate options will not have any effect.
												</AlertBlock>
											)}
											<FormLabel>Host</FormLabel>
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
															className="max-w-[10rem]"
														>
															<p>Generate sslip.io domain</p>
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
												<FormLabel>Path</FormLabel>
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
												<FormLabel>Internal Path</FormLabel>
												<FormDescription>
													The path where your application expects to receive
													requests internally (defaults to "/")
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
												<FormLabel>Strip Path</FormLabel>
												<FormDescription>
													Remove the external path from the request before
													forwarding to the application
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
												<FormLabel>Container Port</FormLabel>
												<FormDescription>
													The port where your application is running inside the
													container (e.g., 3000 for Node.js, 80 for Nginx, 8080
													for Java)
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
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>Custom Entrypoint</FormLabel>
												<FormDescription>
													Use custom entrypoint for domain
													<br />
													"web" and/or "websecure" is used by default.
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
												<FormLabel>Entrypoint Name</FormLabel>
												<FormControl>
													<Input
														placeholder="Enter entrypoint name manually"
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
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>HTTPS</FormLabel>
												<FormDescription>
													Automatically provision SSL Certificate.
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
														<FormLabel>Certificate Provider</FormLabel>
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
																	<SelectValue placeholder="Select a certificate provider" />
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																<SelectItem value={"none"}>None</SelectItem>
																<SelectItem value={"letsencrypt"}>
																	Let's Encrypt
																</SelectItem>
																<SelectItem value={"custom"}>Custom</SelectItem>
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
															<FormLabel>Custom Certificate Resolver</FormLabel>
															<FormControl>
																<Input
																	className="w-full"
																	placeholder="Enter your custom certificate resolver"
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
								<FormItem>
									<div className="flex items-center justify-between gap-4">
										<div>
											<FormLabel>Access Rules</FormLabel>
											<FormDescription>
												Protect path patterns with basic auth, IP allow list,
												and advanced Traefik matchers.
											</FormDescription>
										</div>
										<Button
											type="button"
											variant="secondary"
											onClick={addAccessRule}
										>
											Add Rule
										</Button>
									</div>
									{fields.length === 0 ? (
										<div className="border rounded-lg border-dashed p-4 text-sm text-muted-foreground">
											No access rules yet.
										</div>
									) : (
										<ScrollArea className="max-h-[34rem] pr-4">
											<div className="space-y-4">
												{fields.map((field, index) =>
													renderAccessRuleCard(
														field as typeof field & DomainAccessRule,
														index,
													),
												)}
											</div>
										</ScrollArea>
									)}
								</FormItem>
								<FormField
									control={form.control}
									name="middlewares"
									render={({ field }) => (
										<FormItem>
											<div className="flex items-center gap-2">
												<FormLabel>Middlewares</FormLabel>
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger type="button">
															<div className="size-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
																?
															</div>
														</TooltipTrigger>
														<TooltipContent className="max-w-[300px]">
															<p>
																Add Traefik middleware references. Middlewares
																must be defined in your Traefik configuration.
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
														placeholder="e.g., rate-limit@file, auth@file"
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
																'input[placeholder="e.g., rate-limit@file, auth@file"]',
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
														Add
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
