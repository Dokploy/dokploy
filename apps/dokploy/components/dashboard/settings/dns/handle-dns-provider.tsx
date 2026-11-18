import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { dnsProviderIcons } from "@/components/icons/dns-provider-icons";
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
import { Input } from "@/components/ui/input";
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
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const providerLabels = {
	cloudflare: "Cloudflare",
	route53: "AWS Route53",
	porkbun: "Porkbun",
	infomaniak: "Infomaniak",
	ovh: "OVHcloud",
} as const;

const ovhEndpointLabels = {
	"ovh-eu": "OVHcloud Europe",
	"ovh-ca": "OVHcloud Canada",
	"ovh-us": "OVHcloud US",
	"kimsufi-eu": "Kimsufi Europe",
	"kimsufi-ca": "Kimsufi Canada",
	"soyoustart-eu": "So you Start Europe",
	"soyoustart-ca": "So you Start Canada",
} as const;

type ProviderType = keyof typeof providerLabels;

const DnsProviderSchema = z.object({
	name: z
		.string()
		.min(1, { message: "settings.dns.provider.errors.nameRequired" })
		.regex(/^[a-zA-Z0-9_-]+$/, {
			message: "settings.dns.provider.errors.nameFormat",
		}),
	providerType: z.enum([
		"cloudflare",
		"route53",
		"porkbun",
		"infomaniak",
		"ovh",
	]),
	apiToken: z.string(),
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
	apiKey: z.string(),
	secretApiKey: z.string(),
	endpoint: z.enum(
		Object.keys(ovhEndpointLabels) as [
			keyof typeof ovhEndpointLabels,
			...(keyof typeof ovhEndpointLabels)[],
		],
	),
	applicationKey: z.string(),
	applicationSecret: z.string(),
	consumerKey: z.string(),
	zone: z.string(),
});

type DnsProviderForm = z.infer<typeof DnsProviderSchema>;

const defaultValues: DnsProviderForm = {
	name: "",
	providerType: "cloudflare",
	apiToken: "",
	accessKeyId: "",
	secretAccessKey: "",
	apiKey: "",
	secretApiKey: "",
	endpoint: "ovh-eu",
	applicationKey: "",
	applicationSecret: "",
	consumerKey: "",
	zone: "",
};

const buildConfig = (data: DnsProviderForm) => {
	switch (data.providerType) {
		case "cloudflare":
			return {
				providerType: "cloudflare" as const,
				apiToken: data.apiToken,
			};
		case "route53":
			return {
				providerType: "route53" as const,
				accessKeyId: data.accessKeyId,
				secretAccessKey: data.secretAccessKey,
			};
		case "porkbun":
			return {
				providerType: "porkbun" as const,
				apiKey: data.apiKey,
				secretApiKey: data.secretApiKey,
			};
		case "infomaniak":
			return {
				providerType: "infomaniak" as const,
				apiToken: data.apiToken,
			};
		case "ovh":
			return {
				providerType: "ovh" as const,
				endpoint: data.endpoint,
				applicationKey: data.applicationKey,
				applicationSecret: data.applicationSecret,
				consumerKey: data.consumerKey,
				zone: data.zone.trim() || undefined,
			};
	}
};

const extractErrorMessage = (err: unknown) => {
	if (!(err instanceof Error)) return undefined;
	try {
		const issues = JSON.parse(err.message) as { message?: string }[];
		if (Array.isArray(issues)) {
			return issues
				.map((issue) => issue.message)
				.filter(Boolean)
				.join(", ");
		}
	} catch {}
	return err.message;
};

interface Props {
	dnsProviderId?: string;
}

export const HandleDnsProvider = ({ dnsProviderId }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { data: provider } = api.dnsProvider.one.useQuery(
		{ dnsProviderId: dnsProviderId || "" },
		{ enabled: !!dnsProviderId && isOpen },
	);

	const { mutateAsync, isPending, error, isError } = dnsProviderId
		? api.dnsProvider.update.useMutation()
		: api.dnsProvider.create.useMutation();

	const { mutateAsync: testConnection, isPending: isTesting } =
		api.dnsProvider.testConnection.useMutation();

	const form = useForm<DnsProviderForm>({
		defaultValues,
		resolver: zodResolver(DnsProviderSchema),
	});

	const providerType = form.watch("providerType");

	useEffect(() => {
		if (provider) {
			form.reset({
				...defaultValues,
				name: provider.name,
				providerType: provider.config.providerType,
				...(provider.config.providerType === "cloudflare" && {
					apiToken: provider.config.apiToken,
				}),
				...(provider.config.providerType === "route53" && {
					accessKeyId: provider.config.accessKeyId,
					secretAccessKey: provider.config.secretAccessKey,
				}),
				...(provider.config.providerType === "porkbun" && {
					apiKey: provider.config.apiKey,
					secretApiKey: provider.config.secretApiKey,
				}),
				...(provider.config.providerType === "infomaniak" && {
					apiToken: provider.config.apiToken,
				}),
				...(provider.config.providerType === "ovh" && {
					endpoint: provider.config.endpoint,
					applicationKey: provider.config.applicationKey,
					applicationSecret: provider.config.applicationSecret,
					consumerKey: provider.config.consumerKey,
					zone: provider.config.zone ?? "",
				}),
			});
		} else if (!dnsProviderId) {
			form.reset(defaultValues);
		}
	}, [provider, dnsProviderId, form, isOpen]);

	const onSubmit = async (data: DnsProviderForm) => {
		const payload: any = {
			name: data.name,
			config: buildConfig(data),
			...(dnsProviderId && { dnsProviderId }),
		};
		await mutateAsync(payload)
			.then(() => {
				toast.success(
					dnsProviderId
						? t("settings.dns.provider.updated")
						: t("settings.dns.provider.created"),
				);
				utils.dnsProvider.all.invalidate();
				setIsOpen(false);
			})
			.catch(() => {});
	};

	const onTestConnection = async () => {
		const isValid = await form.trigger();
		if (!isValid) {
			return;
		}
		const data = form.getValues();
		await testConnection({
			config: buildConfig(data),
			...(dnsProviderId && { dnsProviderId }),
		})
			.then(() => {
				toast.success(t("settings.vault.provider.connectionSuccessful"));
			})
			.catch((err) => {
				toast.error(t("settings.vault.provider.connectionFailed"), {
					description: extractErrorMessage(err),
				});
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			{dnsProviderId ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<DialogTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="text-muted-foreground"
							>
								<PenBoxIcon className="size-4" />
								<span className="sr-only">
									{t("settings.dns.provider.editProvider")}
								</span>
							</Button>
						</DialogTrigger>
					</TooltipTrigger>
					<TooltipContent>
						{t("settings.dns.provider.editProvider")}
					</TooltipContent>
				</Tooltip>
			) : (
				<DialogTrigger asChild>
					<Button>
						<PlusIcon className="size-4" />
						{t("settings.dns.provider.trigger")}
					</Button>
				</DialogTrigger>
			)}
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{dnsProviderId
							? t("settings.dns.provider.updateTitle")
							: t("settings.dns.provider.addTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.dns.provider.description")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("settings.servers.connect.name")}</FormLabel>
									<FormControl>
										<Input placeholder="prod-cloudflare" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="providerType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("settings.vault.provider.providerLabel")}
									</FormLabel>
									<Select
										onValueChange={field.onChange}
										value={field.value}
										disabled={!!dnsProviderId}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t(
														"settings.vault.provider.selectProvider",
													)}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{Object.entries(providerLabels).map(([value, label]) => {
												const ProviderIcon =
													dnsProviderIcons[value as ProviderType];
												return (
													<SelectItem key={value} value={value}>
														<div className="flex flex-row items-center gap-2">
															<ProviderIcon className="size-4 shrink-0" />
															{label}
														</div>
													</SelectItem>
												);
											})}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{providerType === "cloudflare" && (
							<FormField
								control={form.control}
								name="apiToken"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.dns.provider.apiToken")}</FormLabel>
										<FormControl>
											<Input type="password" {...field} />
										</FormControl>
										<FormDescription>
											{t("settings.dns.provider.apiTokenHint")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{providerType === "route53" && (
							<>
								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.vault.provider.accessKeyId")}
											</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="secretAccessKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.vault.provider.secretAccessKey")}
											</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormDescription>
												{t("settings.dns.provider.route53Hint")}{" "}
												<code>route53:ListHostedZones</code>,{" "}
												<code>route53:ListResourceRecordSets</code> and{" "}
												<code>route53:ChangeResourceRecordSets</code> —{" "}
												{t("settings.dns.provider.route53HintSuffix")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{providerType === "porkbun" && (
							<>
								<FormField
									control={form.control}
									name="apiKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.dns.provider.apiKey")}</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="secretApiKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.dns.provider.secretApiKey")}
											</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormDescription>
												{t("settings.dns.provider.porkbunHint")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{providerType === "infomaniak" && (
							<FormField
								control={form.control}
								name="apiToken"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.dns.provider.apiToken")}</FormLabel>
										<FormControl>
											<Input type="password" {...field} />
										</FormControl>
										<FormDescription>
											{t("settings.dns.provider.infomaniakHint")}{" "}
											<code>domain:read</code>, <code>dns:read</code> and{" "}
											<code>dns:write</code>.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{providerType === "ovh" && (
							<>
								<FormField
									control={form.control}
									name="endpoint"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.dns.provider.apiEndpoint")}
											</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"settings.dns.provider.selectEndpoint",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{Object.entries(ovhEndpointLabels).map(
														([value, label]) => (
															<SelectItem key={value} value={value}>
																{label}
															</SelectItem>
														),
													)}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="applicationKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.dns.provider.applicationKey")}
											</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="applicationSecret"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.dns.provider.applicationSecret")}
											</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="consumerKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.dns.provider.consumerKey")}
											</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormDescription>
												{t("settings.dns.provider.ovhKeysHint")}
												<br />
												<code>GET /domain/zone</code>
												<br />
												<code>GET /domain/zone/*</code>
												<br />
												<code>POST /domain/zone/*</code>
												<br />
												<code>PUT /domain/zone/*</code>
												<br />
												<code>DELETE /domain/zone/*</code>
												<br />
												{t("settings.dns.provider.ovhKeysHintSuffix")}{" "}
												<code>/domain/zone/*</code>{" "}
												{t("settings.dns.provider.ovhKeysHintSuffix2")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="zone"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("settings.dns.provider.zone")}</FormLabel>
											<FormControl>
												<Input placeholder="example.com" {...field} />
											</FormControl>
											<FormDescription>
												{t("settings.dns.provider.zoneHint")}{" "}
												<code>GET /domain/zone</code>{" "}
												{t("settings.dns.provider.zoneHintSuffix")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						<DialogFooter className="flex w-full flex-row justify-between gap-2 sm:justify-between">
							<Button
								type="button"
								variant="secondary"
								isLoading={isTesting}
								onClick={onTestConnection}
							>
								{t("settings.vault.provider.testConnection")}
							</Button>
							<Button type="submit" isLoading={isPending}>
								{dnsProviderId
									? t("settings.servers.handle.update")
									: t("settings.servers.handle.create")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
