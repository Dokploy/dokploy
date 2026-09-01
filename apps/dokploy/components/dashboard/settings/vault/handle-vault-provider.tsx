import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { vaultProviderIcons } from "@/components/icons/vault-provider-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { api } from "@/utils/api";

const providerLabels = {
	hashicorp: "HashiCorp Vault / OpenBao",
	infisical: "Infisical",
	aws: "AWS Secrets Manager",
	doppler: "Doppler",
	azure: "Azure Key Vault",
	scaleway: "Scaleway Secret Manager",
	phase: "Phase",
} as const;

type ProviderType = keyof typeof providerLabels;

const VaultProviderSchema = z
	.object({
		name: z
			.string()
			.min(1, { message: "Name is required" })
			.regex(/^[a-zA-Z0-9_-]+$/, {
				message:
					"Only letters, numbers, dashes and underscores (used in ${{vault.<name>.<secret>}})",
			}),
		providerType: z.enum([
			"hashicorp",
			"infisical",
			"aws",
			"doppler",
			"azure",
			"scaleway",
			"phase",
		]),
		url: z.string(),
		token: z.string(),
		namespace: z.string(),
		mount: z.string(),
		siteUrl: z.string(),
		clientId: z.string(),
		clientSecret: z.string(),
		projectId: z.string(),
		environmentSlug: z.string(),
		secretPath: z.string(),
		region: z.string(),
		accessKeyId: z.string(),
		secretAccessKey: z.string(),
		serviceToken: z.string(),
		awsEndpoint: z.string(),
		vaultUri: z.string(),
		tenantId: z.string(),
		azureClientId: z.string(),
		azureClientSecret: z.string(),
		dopplerProject: z.string(),
		dopplerConfig: z.string(),
		scalewayRegion: z.string(),
		scalewayProjectId: z.string(),
		scalewaySecretKey: z.string(),
		scalewayApiUrl: z.string(),
		phaseToken: z.string(),
		phaseAppId: z.string(),
		phaseEnv: z.string(),
		phasePath: z.string(),
		phaseApiUrl: z.string(),
		assignments: z.array(
			z.object({
				projectId: z.string(),
				environmentIds: z.array(z.string()),
			}),
		),
	})
	.superRefine((data, ctx) => {
		const isValidUrl = (value: string) => {
			try {
				new URL(value);
				return true;
			} catch {
				return false;
			}
		};

		if (
			data.providerType === "hashicorp" &&
			data.url &&
			!isValidUrl(data.url)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Enter a valid URL (e.g. https://vault.example.com:8200)",
				path: ["url"],
			});
		}
		if (
			data.providerType === "azure" &&
			data.vaultUri &&
			!isValidUrl(data.vaultUri)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Enter a valid URL (e.g. https://my-vault.vault.azure.net)",
				path: ["vaultUri"],
			});
		}
		if (
			data.providerType === "aws" &&
			data.awsEndpoint &&
			!isValidUrl(data.awsEndpoint)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Enter a valid URL",
				path: ["awsEndpoint"],
			});
		}
		if (
			data.providerType === "scaleway" &&
			data.scalewayApiUrl &&
			!isValidUrl(data.scalewayApiUrl)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Enter a valid URL (e.g. https://api.scaleway.com)",
				path: ["scalewayApiUrl"],
			});
		}
		if (
			data.providerType === "infisical" &&
			data.siteUrl &&
			!isValidUrl(data.siteUrl)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Enter a valid URL (e.g. https://app.infisical.com)",
				path: ["siteUrl"],
			});
		}
		if (
			data.providerType === "phase" &&
			data.phaseApiUrl &&
			!isValidUrl(data.phaseApiUrl)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Enter a valid URL (e.g. https://api.phase.dev)",
				path: ["phaseApiUrl"],
			});
		}

		const required: Partial<
			Record<ProviderType, [keyof typeof data, string][]>
		> = {
			hashicorp: [
				["url", "Vault URL is required"],
				["token", "Token is required"],
				["mount", "Mount is required"],
			],
			infisical: [
				["siteUrl", "Site URL is required"],
				["clientId", "Client ID is required"],
				["clientSecret", "Client Secret is required"],
				["projectId", "Project ID is required"],
				["environmentSlug", "Environment is required"],
			],
			aws: [
				["region", "Region is required"],
				["accessKeyId", "Access Key ID is required"],
				["secretAccessKey", "Secret Access Key is required"],
			],
			doppler: [["serviceToken", "Service Token is required"]],
			azure: [
				["vaultUri", "Vault URI is required"],
				["tenantId", "Tenant ID is required"],
				["azureClientId", "Client ID is required"],
				["azureClientSecret", "Client Secret is required"],
			],
			scaleway: [
				["scalewayRegion", "Region is required"],
				["scalewayProjectId", "Project ID is required"],
				["scalewaySecretKey", "Secret Key is required"],
			],
			phase: [
				["phaseToken", "Service Account REST API token is required"],
				["phaseAppId", "App ID is required"],
				["phaseEnv", "Environment is required"],
			],
		};

		for (const [field, message] of required[data.providerType] ?? []) {
			if (!data[field]) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message,
					path: [field],
				});
			}
		}

		if (
			data.providerType === "doppler" &&
			data.serviceToken &&
			!data.serviceToken.startsWith("dp.st.") &&
			data.serviceToken !== "********"
		) {
			for (const field of ["dopplerProject", "dopplerConfig"] as const) {
				if (!data[field]) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Required for personal/CLI tokens (dp.pt. / dp.ct.)",
						path: [field],
					});
				}
			}
		}
	});

type VaultProviderForm = z.infer<typeof VaultProviderSchema>;

const defaultValues: VaultProviderForm = {
	name: "",
	providerType: "hashicorp",
	url: "",
	token: "",
	namespace: "",
	mount: "secret",
	siteUrl: "https://app.infisical.com",
	clientId: "",
	clientSecret: "",
	projectId: "",
	environmentSlug: "",
	secretPath: "/",
	region: "",
	accessKeyId: "",
	secretAccessKey: "",
	serviceToken: "",
	awsEndpoint: "",
	vaultUri: "",
	tenantId: "",
	azureClientId: "",
	azureClientSecret: "",
	dopplerProject: "",
	dopplerConfig: "",
	scalewayRegion: "fr-par",
	scalewayProjectId: "",
	scalewaySecretKey: "",
	scalewayApiUrl: "https://api.scaleway.com",
	phaseToken: "",
	phaseAppId: "",
	phaseEnv: "",
	phasePath: "/",
	phaseApiUrl: "https://api.phase.dev",
	assignments: [],
};

const buildConfig = (data: VaultProviderForm) => {
	switch (data.providerType) {
		case "hashicorp":
			return {
				providerType: "hashicorp" as const,
				url: data.url,
				token: data.token,
				namespace: data.namespace || undefined,
				mount: data.mount || "secret",
			};
		case "infisical":
			return {
				providerType: "infisical" as const,
				siteUrl: data.siteUrl || "https://app.infisical.com",
				clientId: data.clientId,
				clientSecret: data.clientSecret,
				projectId: data.projectId,
				environmentSlug: data.environmentSlug,
				secretPath: data.secretPath || "/",
			};
		case "aws":
			return {
				providerType: "aws" as const,
				region: data.region,
				accessKeyId: data.accessKeyId,
				secretAccessKey: data.secretAccessKey,
				endpoint: data.awsEndpoint || undefined,
			};
		case "doppler":
			return {
				providerType: "doppler" as const,
				serviceToken: data.serviceToken,
				project: data.dopplerProject || undefined,
				config: data.dopplerConfig || undefined,
			};
		case "azure":
			return {
				providerType: "azure" as const,
				vaultUri: data.vaultUri,
				tenantId: data.tenantId,
				clientId: data.azureClientId,
				clientSecret: data.azureClientSecret,
			};
		case "scaleway":
			return {
				providerType: "scaleway" as const,
				region: data.scalewayRegion || "fr-par",
				projectId: data.scalewayProjectId,
				secretKey: data.scalewaySecretKey,
				apiUrl: data.scalewayApiUrl || "https://api.scaleway.com",
			};
		case "phase":
			return {
				providerType: "phase" as const,
				token: data.phaseToken,
				appId: data.phaseAppId,
				env: data.phaseEnv,
				path: data.phasePath || "/",
				apiUrl: data.phaseApiUrl || "https://api.phase.dev",
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
	vaultProviderId?: string;
}

export const HandleVaultProvider = ({ vaultProviderId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);

	const { data: provider } = api.vaultProvider.one.useQuery(
		{ vaultProviderId: vaultProviderId || "" },
		{ enabled: !!vaultProviderId && isOpen },
	);

	const { mutateAsync, isPending, error, isError } = vaultProviderId
		? api.vaultProvider.update.useMutation()
		: api.vaultProvider.create.useMutation();

	const { mutateAsync: testConnection, isPending: isTesting } =
		api.vaultProvider.testConnection.useMutation();

	const form = useForm<VaultProviderForm>({
		defaultValues,
		resolver: zodResolver(VaultProviderSchema),
	});

	const providerType = form.watch("providerType");
	const assignments = form.watch("assignments");
	const { data: orgProjects } = api.project.all.useQuery();

	const setAssignments = (
		next: { projectId: string; environmentIds: string[] }[],
	) => form.setValue("assignments", next, { shouldValidate: true });

	const toggleProject = (targetProjectId: string) => {
		const exists = assignments.some((a) => a.projectId === targetProjectId);
		setAssignments(
			exists
				? assignments.filter((a) => a.projectId !== targetProjectId)
				: [...assignments, { projectId: targetProjectId, environmentIds: [] }],
		);
	};

	const toggleEnvironment = (
		targetProjectId: string,
		environmentId: string,
	) => {
		setAssignments(
			assignments.map((a) => {
				if (a.projectId !== targetProjectId) return a;
				const has = a.environmentIds.includes(environmentId);
				return {
					...a,
					environmentIds: has
						? a.environmentIds.filter((e) => e !== environmentId)
						: [...a.environmentIds, environmentId],
				};
			}),
		);
	};

	useEffect(() => {
		if (provider) {
			form.reset({
				...defaultValues,
				name: provider.name,
				providerType: provider.config.providerType,
				assignments: provider.assignments ?? [],
				...(provider.config.providerType === "hashicorp" && {
					url: provider.config.url,
					token: provider.config.token,
					namespace: provider.config.namespace ?? "",
					mount: provider.config.mount,
				}),
				...(provider.config.providerType === "infisical" && {
					siteUrl: provider.config.siteUrl,
					clientId: provider.config.clientId,
					clientSecret: provider.config.clientSecret,
					projectId: provider.config.projectId,
					environmentSlug: provider.config.environmentSlug,
					secretPath: provider.config.secretPath,
				}),
				...(provider.config.providerType === "aws" && {
					region: provider.config.region,
					accessKeyId: provider.config.accessKeyId,
					secretAccessKey: provider.config.secretAccessKey,
					awsEndpoint: provider.config.endpoint ?? "",
				}),
				...(provider.config.providerType === "doppler" && {
					serviceToken: provider.config.serviceToken,
					dopplerProject: provider.config.project ?? "",
					dopplerConfig: provider.config.config ?? "",
				}),
				...(provider.config.providerType === "azure" && {
					vaultUri: provider.config.vaultUri,
					tenantId: provider.config.tenantId,
					azureClientId: provider.config.clientId,
					azureClientSecret: provider.config.clientSecret,
				}),
				...(provider.config.providerType === "scaleway" && {
					scalewayRegion: provider.config.region,
					scalewayProjectId: provider.config.projectId,
					scalewaySecretKey: provider.config.secretKey,
					scalewayApiUrl: provider.config.apiUrl,
				}),
				...(provider.config.providerType === "phase" && {
					phaseToken: provider.config.token,
					phaseAppId: provider.config.appId,
					phaseEnv: provider.config.env,
					phasePath: provider.config.path,
					phaseApiUrl: provider.config.apiUrl,
				}),
			});
		} else if (!vaultProviderId) {
			form.reset(defaultValues);
		}
	}, [provider, vaultProviderId, form, isOpen]);

	const onSubmit = async (data: VaultProviderForm) => {
		const payload: any = {
			name: data.name,
			config: buildConfig(data),
			assignments: data.assignments,
			...(vaultProviderId && { vaultProviderId }),
		};
		await mutateAsync(payload)
			.then(() => {
				toast.success(
					vaultProviderId ? "Vault provider updated" : "Vault provider created",
				);
				utils.vaultProvider.all.invalidate();
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
			...(vaultProviderId && { vaultProviderId }),
		})
			.then(() => {
				toast.success("Connection successful");
			})
			.catch((err) => {
				toast.error("Connection failed", {
					description: extractErrorMessage(err),
				});
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{vaultProviderId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<PenBoxIcon className="size-4 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add Provider
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{vaultProviderId ? "Update Vault Provider" : "Add Vault Provider"}
					</DialogTitle>
					<DialogDescription>
						Reference secrets in your environment variables with{" "}
						<code>{"${{vault.<name>.<secret>}}"}</code>. Secrets are fetched at
						deploy time and never stored in Dokploy.
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
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="prod-vault" {...field} />
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
									<FormLabel>Provider</FormLabel>
									<Select
										onValueChange={field.onChange}
										value={field.value}
										disabled={!!vaultProviderId}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a provider" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{Object.entries(providerLabels).map(([value, label]) => {
												const ProviderIcon =
													vaultProviderIcons[value as ProviderType];
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

						{providerType === "hashicorp" && (
							<>
								<FormField
									control={form.control}
									name="url"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Vault URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://vault.example.com:8200"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="token"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Token</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="mount"
										render={({ field }) => (
											<FormItem>
												<FormLabel>KV Mount</FormLabel>
												<FormControl>
													<Input placeholder="secret" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="namespace"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Namespace (optional)</FormLabel>
												<FormControl>
													<Input placeholder="admin" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormDescription>
									Reference format:{" "}
									<code>{"${{vault.<name>.path/to/secret:FIELD}}"}</code>
								</FormDescription>
							</>
						)}

						{providerType === "infisical" && (
							<>
								<FormField
									control={form.control}
									name="siteUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Site URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://app.infisical.com"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="clientId"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Client ID</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="clientSecret"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Client Secret</FormLabel>
												<FormControl>
													<Input type="password" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="projectId"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Project ID</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="environmentSlug"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Environment</FormLabel>
												<FormControl>
													<Input placeholder="prod" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormField
									control={form.control}
									name="secretPath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Secret Path</FormLabel>
											<FormControl>
												<Input placeholder="/" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{providerType === "aws" && (
							<>
								<FormField
									control={form.control}
									name="region"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Region</FormLabel>
											<FormControl>
												<Input placeholder="us-east-1" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Access Key ID</FormLabel>
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
											<FormLabel>Secret Access Key</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="awsEndpoint"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Endpoint (optional)</FormLabel>
											<FormControl>
												<Input placeholder="http://localhost:4566" {...field} />
											</FormControl>
											<FormDescription>
												Custom endpoint for VPC endpoints or API-compatible
												emulators
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormDescription>
									Reference format:{" "}
									<code>{"${{vault.<name>.secret-name}}"}</code> or{" "}
									<code>{"${{vault.<name>.secret-name:field}}"}</code> for JSON
									secrets
								</FormDescription>
							</>
						)}

						{providerType === "azure" && (
							<>
								<FormField
									control={form.control}
									name="vaultUri"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Vault URI</FormLabel>
											<FormControl>
												<Input
													placeholder="https://my-vault.vault.azure.net"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="tenantId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Tenant ID</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="azureClientId"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Client ID</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="azureClientSecret"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Client Secret</FormLabel>
												<FormControl>
													<Input type="password" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormDescription>
									App Registration with the "Key Vault Secrets User" role on the
									vault. Reference format:{" "}
									<code>{"${{vault.<name>.secret-name}}"}</code>
								</FormDescription>
							</>
						)}

						{providerType === "doppler" && (
							<>
								<FormField
									control={form.control}
									name="serviceToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Token</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="dp.st..."
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Service tokens (dp.st.) are recommended: read-only and
												scoped to a single project + config
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="dopplerProject"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Project (optional)</FormLabel>
												<FormControl>
													<Input placeholder="my-project" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="dopplerConfig"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Config (optional)</FormLabel>
												<FormControl>
													<Input placeholder="prd" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormDescription>
									Only needed for personal (dp.pt.) or CLI (dp.ct.) tokens —
									service tokens already carry them
								</FormDescription>
							</>
						)}

						{providerType === "scaleway" && (
							<>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="scalewayRegion"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Region</FormLabel>
												<Select
													onValueChange={field.onChange}
													value={field.value}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="fr-par" />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														{["fr-par", "nl-ams", "pl-waw"].map((region) => (
															<SelectItem key={region} value={region}>
																{region}
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
										name="scalewayProjectId"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Project ID</FormLabel>
												<FormControl>
													<Input
														placeholder="00000000-0000-0000-0000-000000000000"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormField
									control={form.control}
									name="scalewaySecretKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Secret Key</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormDescription>
												The secret key of an API key with the{" "}
												<code>SecretManagerReadOnly</code> permission set
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="scalewayApiUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://api.scaleway.com"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormDescription>
									Reference format:{" "}
									<code>{"${{vault.<name>.secret-name}}"}</code>,{" "}
									<code>{"${{vault.<name>.folder/secret-name}}"}</code> for
									secrets in a path, or{" "}
									<code>{"${{vault.<name>.secret-name:field}}"}</code> for JSON
									secrets
								</FormDescription>
							</>
						)}

						{providerType === "phase" && (
							<>
								<FormField
									control={form.control}
									name="phaseToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Service Account REST API Token</FormLabel>
											<FormControl>
												<Input type="password" {...field} />
											</FormControl>
											<FormDescription>
												Use the REST API token from a Service Account — not the
												CLI/SDK <code>pss_*</code> token. The Phase App must
												have Server-side Encryption (SSE) enabled.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="phaseAppId"
										render={({ field }) => (
											<FormItem>
												<FormLabel>App ID</FormLabel>
												<FormControl>
													<Input
														placeholder="00000000-0000-0000-0000-000000000000"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="phaseEnv"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Environment</FormLabel>
												<FormControl>
													<Input placeholder="Production" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								<FormField
									control={form.control}
									name="phasePath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Secret Path</FormLabel>
											<FormControl>
												<Input placeholder="/" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="phaseApiUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel>API URL</FormLabel>
											<FormControl>
												<Input placeholder="https://api.phase.dev" {...field} />
											</FormControl>
											<FormDescription>
												Self-hosted Phase defaults to{" "}
												<code>{"${HTTP_PROTOCOL}${HOST}/service/public"}</code>
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormDescription>
									Reference format:{" "}
									<code>{"${{vault.<name>.SECRET_KEY}}"}</code>
								</FormDescription>
							</>
						)}

						<div className="flex flex-col gap-2 rounded-lg border p-3">
							<div className="flex flex-row items-center justify-between">
								<FormLabel>Access</FormLabel>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={() =>
										setAssignments(
											assignments.length === orgProjects?.length
												? []
												: (orgProjects ?? []).map((project) => ({
														projectId: project.projectId,
														environmentIds: [],
													})),
										)
									}
								>
									{assignments.length === orgProjects?.length
										? "Clear all"
										: "Access all"}
								</Button>
							</div>
							<FormDescription>
								This provider can only be referenced from the selected projects.
								Pick environments to narrow it further — none selected means all
								environments of that project.
							</FormDescription>
							<div className="flex flex-col gap-2">
								{orgProjects?.map((project) => {
									const assignment = assignments.find(
										(a) => a.projectId === project.projectId,
									);
									return (
										<div
											key={project.projectId}
											className="flex flex-col gap-1.5"
										>
											<label className="flex flex-row items-center gap-2 text-sm cursor-pointer">
												<Checkbox
													checked={!!assignment}
													onCheckedChange={() =>
														toggleProject(project.projectId)
													}
												/>
												{project.name}
											</label>
											{assignment && (
												<div className="flex flex-row flex-wrap gap-3 pl-6">
													{project.environments?.map((environment) => (
														<label
															key={environment.environmentId}
															className="flex flex-row items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
														>
															<Checkbox
																checked={assignment.environmentIds.includes(
																	environment.environmentId,
																)}
																onCheckedChange={() =>
																	toggleEnvironment(
																		project.projectId,
																		environment.environmentId,
																	)
																}
															/>
															{environment.name}
														</label>
													))}
													{assignment.environmentIds.length === 0 && (
														<span className="text-xs text-muted-foreground italic self-center">
															All environments
														</span>
													)}
												</div>
											)}
										</div>
									);
								})}
							</div>
							{form.formState.errors.assignments && (
								<p className="text-sm font-medium text-destructive">
									{form.formState.errors.assignments.message}
								</p>
							)}
						</div>

						<DialogFooter className="flex w-full flex-row justify-between gap-2 sm:justify-between">
							<Button
								type="button"
								variant="secondary"
								isLoading={isTesting}
								onClick={onTestConnection}
							>
								Test Connection
							</Button>
							<Button type="submit" isLoading={isPending}>
								{vaultProviderId ? "Update" : "Create"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
