import {
	isValidPreviewWildcard,
	PREVIEW_WILDCARD_GUIDANCE,
} from "@dokploy/server/utils/preview-wildcard";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { HelpCircle, Plus, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { Secrets } from "@/components/ui/secrets";
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

const schema = z
	.object({
		env: z.string(),
		wildcardDomain: z
			.string()
			.refine(isValidPreviewWildcard, { message: PREVIEW_WILDCARD_GUIDANCE }),
		previewLimit: z.number(),
		previewLabels: z.array(z.string()).optional(),
		previewHttps: z.boolean(),
		previewPath: z.string(),
		previewCertificateType: z.enum(["letsencrypt", "none", "custom"]),
		previewCustomCertResolver: z.string().optional(),
		previewRequireCollaboratorPermissions: z.boolean(),
	})
	.superRefine((input, ctx) => {
		if (
			input.previewCertificateType === "custom" &&
			!input.previewCustomCertResolver
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["previewCustomCertResolver"],
				message: "Required",
			});
		}
	});

type Schema = z.infer<typeof schema>;

interface Props {
	composeId: string;
}

export const ShowPreviewSettingsCompose = ({ composeId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isEnabled, setIsEnabled] = useState(false);
	const { mutateAsync: updateCompose, isPending } =
		api.compose.update.useMutation();

	const { data, refetch } = api.compose.one.useQuery({ composeId });

	const { data: server } = api.server.one.useQuery(
		{ serverId: data?.serverId || "" },
		{ enabled: !!data?.serverId },
	);

	const projectId = data?.environment?.projectId;
	const { data: wildcardConfig } = api.project.getWildcardDomainConfig.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId, retry: false },
	);

	// Mirrors `resolveGeneratedDomainBase`: the project override outranks the
	// server default domain, which in turn outranks the organization wildcard.
	const resolvedBase =
		wildcardConfig?.effectiveSource === "project"
			? wildcardConfig.effectiveBaseDomain
			: ((data?.serverId ? server?.defaultDomain : null) ??
				wildcardConfig?.effectiveBaseDomain ??
				null);

	const defaultWildcard = resolvedBase ? `*.${resolvedBase}` : "*.sslip.io";

	const form = useForm<Schema>({
		defaultValues: {
			env: "",
			wildcardDomain: "*.sslip.io",
			previewLimit: 3,
			previewLabels: [],
			previewHttps: false,
			previewPath: "/",
			previewCertificateType: "none",
			previewRequireCollaboratorPermissions: true,
		},
		resolver: zodResolver(schema),
	});

	const previewHttps = form.watch("previewHttps");
	const wildcardDomain = form.watch("wildcardDomain");
	const isTraefikMeDomain = wildcardDomain?.includes("sslip.io") || false;

	const templatePreview = useMemo(() => {
		const template = wildcardDomain || "*.sslip.io";
		const appName = data?.appName || "my-app";
		const exampleService = "web";
		const exampleVars: Record<string, string> = {
			appName: `${appName}-${exampleService}`,
			prNumber: "42",
			branchName: "feature-login",
			uniqueId: "a1b2c3",
		};
		let result = template.replace(
			/\$\{(appName|prNumber|branchName|uniqueId)\}/g,
			(_match: string, key: string) => exampleVars[key] ?? "",
		);
		const hasUniqueVar =
			template.includes("${prNumber}") ||
			template.includes("${branchName}") ||
			template.includes("${uniqueId}");
		if (!hasUniqueVar) {
			result = result.replace("*", `${appName}-${exampleService}-a1b2c3`);
		} else {
			result = result.replace("*", `${appName}-${exampleService}`);
		}
		return result;
	}, [wildcardDomain, data?.appName]);

	useEffect(() => {
		setIsEnabled(data?.isPreviewDeploymentsActive || false);
	}, [data?.isPreviewDeploymentsActive]);

	useEffect(() => {
		if (data) {
			form.reset({
				env: data.previewEnv || "",
				wildcardDomain: data.previewWildcard || defaultWildcard,
				previewLabels: data.previewLabels || [],
				previewLimit: data.previewLimit || 3,
				previewHttps: data.previewHttps || false,
				previewPath: data.previewPath || "/",
				previewCertificateType: data.previewCertificateType || "none",
				previewCustomCertResolver: data.previewCustomCertResolver || "",
				previewRequireCollaboratorPermissions:
					data.previewRequireCollaboratorPermissions ?? true,
			});
		}
	}, [data, defaultWildcard]);

	const onSubmit = async (formData: Schema) => {
		updateCompose({
			previewEnv: formData.env,
			previewWildcard: formData.wildcardDomain,
			previewLabels: formData.previewLabels,
			composeId,
			previewLimit: formData.previewLimit,
			previewHttps: formData.previewHttps,
			previewPath: formData.previewPath,
			previewCertificateType: formData.previewCertificateType,
			previewCustomCertResolver: formData.previewCustomCertResolver,
			previewRequireCollaboratorPermissions:
				formData.previewRequireCollaboratorPermissions,
		})
			.then(() => {
				refetch();
				toast.success("Preview Deployments settings updated");
			})
			.catch((error) => {
				toast.error(error.message);
			});
	};
	return (
		<div>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button variant="outline">
						<Settings2 className="size-4" />
						Configure
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-5xl w-full">
					<DialogHeader>
						<DialogTitle>Preview Deployment Settings</DialogTitle>
						<DialogDescription>
							Adjust the settings for preview deployments of this compose
							service. Each pull request gets an isolated copy of the stack with
							its own per-service domains.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4">
						{isTraefikMeDomain && (
							<AlertBlock type="info">
								<strong>Note:</strong> sslip.io is a public HTTP service and
								does not support SSL/HTTPS. HTTPS and certificate options will
								not have any effect.
							</AlertBlock>
						)}
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-compose-preview-settings"
								className="grid w-full gap-4"
							>
								<div className="grid gap-4 lg:grid-cols-2">
									<FormField
										control={form.control}
										name="wildcardDomain"
										render={({ field }) => (
											<FormItem className="lg:col-span-2">
												<FormLabel>Preview Domain Template</FormLabel>
												<FormControl>
													<Input
														placeholder={`${defaultWildcard} or \${prNumber}.example.com`}
														{...field}
													/>
												</FormControl>
												<FormDescription className="flex flex-col gap-1.5">
													<span>
														Use <code className="text-xs">*.</code> for
														auto-generated subdomains, or template variables for
														custom patterns. Each service in the stack gets its
														own host derived from this template.
													</span>
													<span className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono">
														<code>{"${appName}"}</code>
														<code>{"${prNumber}"}</code>
														<code>{"${branchName}"}</code>
														<code>{"${uniqueId}"}</code>
													</span>
													<span className="text-xs mt-1 px-2 py-1 rounded bg-muted font-mono truncate">
														Example: {templatePreview}
													</span>
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="previewPath"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Preview Path</FormLabel>
												<FormControl>
													<Input placeholder="/" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="previewLimit"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Preview Limit</FormLabel>
												<FormControl>
													<NumberInput placeholder="3" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="previewLabels"
										render={({ field }) => (
											<FormItem className="md:col-span-2">
												<div className="flex items-center gap-2">
													<FormLabel>Preview Labels</FormLabel>
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
															</TooltipTrigger>
															<TooltipContent>
																<p>
																	Add labels that will trigger a preview
																	deployment for a pull request. If no labels
																	are specified, all pull requests will trigger
																	a preview deployment.
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												</div>
												<div className="flex flex-wrap gap-2 mb-2">
													{field.value?.map((label, index) => (
														<Badge
															key={index}
															variant="secondary"
															className="flex items-center gap-1"
														>
															{label}
															<X
																className="size-3 cursor-pointer hover:text-destructive"
																onClick={() => {
																	const newLabels = [...(field.value || [])];
																	newLabels.splice(index, 1);
																	field.onChange(newLabels);
																}}
															/>
														</Badge>
													))}
												</div>
												<div className="flex gap-2">
													<FormControl>
														<Input
															placeholder="Enter a label (e.g. enhancements, needs-review)"
															onKeyDown={(e) => {
																if (e.key === "Enter") {
																	e.preventDefault();
																	const input = e.currentTarget;
																	const label = input.value.trim();
																	if (label) {
																		field.onChange([
																			...(field.value || []),
																			label,
																		]);
																		input.value = "";
																	}
																}
															}}
														/>
													</FormControl>
													<Button
														type="button"
														variant="outline"
														size="icon"
														onClick={() => {
															const input = document.querySelector(
																'input[placeholder*="Enter a label"]',
															) as HTMLInputElement;
															const label = input.value.trim();
															if (label) {
																field.onChange([...(field.value || []), label]);
																input.value = "";
															}
														}}
													>
														<Plus className="size-4" />
													</Button>
												</div>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="previewHttps"
										render={({ field }) => (
											<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-xs">
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
									{previewHttps && (
										<FormField
											control={form.control}
											name="previewCertificateType"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Certificate Provider</FormLabel>
													<Select
														onValueChange={field.onChange}
														defaultValue={field.value || ""}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="Select a certificate provider" />
															</SelectTrigger>
														</FormControl>

														<SelectContent>
															<SelectItem value="none">None</SelectItem>
															<SelectItem value={"letsencrypt"}>
																Let's Encrypt
															</SelectItem>
															<SelectItem value={"custom"}>Custom</SelectItem>
														</SelectContent>
													</Select>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}

									{form.watch("previewCertificateType") === "custom" && (
										<FormField
											control={form.control}
											name="previewCustomCertResolver"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Certificate Resolver</FormLabel>
													<FormControl>
														<Input
															placeholder="my-custom-resolver"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}
								</div>
								<div className="grid gap-4 lg:grid-cols-2">
									<div className="flex flex-row items-center justify-between rounded-lg border p-4 col-span-2">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												Enable preview deployments
											</FormLabel>
											<FormDescription>
												Enable or disable preview deployments for this compose
												service.
											</FormDescription>
										</div>
										<Switch
											checked={isEnabled}
											onCheckedChange={(checked) => {
												updateCompose({
													isPreviewDeploymentsActive: checked,
													composeId,
												})
													.then(() => {
														refetch();
														toast.success(
															checked
																? "Preview deployments enabled"
																: "Preview deployments disabled",
														);
													})
													.catch((error) => {
														toast.error(error.message);
													});
											}}
										/>
									</div>
								</div>

								<div className="grid gap-4 lg:grid-cols-2">
									<FormField
										control={form.control}
										name="previewRequireCollaboratorPermissions"
										render={({ field }) => (
											<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-xs col-span-2">
												<div className="space-y-0.5">
													{data?.sourceType === "gitlab" ? (
														<>
															<FormLabel>Require Member Access</FormLabel>
															<FormDescription>
																Require a minimum GitLab access level to trigger
																preview deployments. Valid roles are:
																<ul>
																	<li>Owner</li>
																	<li>Maintainer</li>
																	<li>Developer</li>
																</ul>
															</FormDescription>
														</>
													) : (
														<>
															<FormLabel>
																Require Collaborator Permissions
															</FormLabel>
															<FormDescription>
																Require collaborator permissions to preview
																deployments, valid roles are:
																<ul>
																	<li>Admin</li>
																	<li>Maintain</li>
																	<li>Write</li>
																</ul>
															</FormDescription>
														</>
													)}
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

								<FormField
									control={form.control}
									name="env"
									render={() => (
										<FormItem>
											<FormControl>
												<Secrets
													name="env"
													title="Environment Settings"
													description={
														<span>
															Environment variables injected into the preview
															stack. Use <code>{"${{preview.prNumber}}"}</code>{" "}
															to reference the pull request number, e.g. to
															point at another service's deterministic preview
															domain (
															<code>
																VITE_API_URL=https://backend-pr$
																{"{{preview.prNumber}}"}.example.com
															</code>
															).
														</span>
													}
													placeholder={[
														"NODE_ENV=production",
														"PORT=3000",
													].join("\n")}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</form>
						</Form>
					</div>
					<DialogFooter>
						<Button
							variant="secondary"
							onClick={() => {
								setIsOpen(false);
							}}
						>
							Cancel
						</Button>
						<Button
							isLoading={isPending}
							form="hook-form-compose-preview-settings"
							type="submit"
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};
