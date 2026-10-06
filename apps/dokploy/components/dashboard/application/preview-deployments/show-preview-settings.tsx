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
import { LearnMoreLink } from "@/components/shared/learn-more-link";
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
import { INTEGRATION_LEARN_MORE_URLS } from "../../settings/integrations/integration-links";
import {
	PoweredBySnapvisor,
	SnapvisorMark,
} from "../../settings/integrations/snapvisor/snapvisor-logo";

const SNAPVISOR_OFF = "__off__";

/**
 * Visual testing (Snapvisor) section: which Snapvisor project this
 * application's preview deployments register their commit against. Hidden
 * (with a hint) when the organization has no Snapvisor integration.
 */
const SnapvisorPreviewSettingSection = ({
	applicationId,
}: {
	applicationId: string;
}) => {
	const { data: integration, isPending: isLoadingIntegration } =
		api.snapvisor.one.useQuery();
	const { data: application } = api.application.one.useQuery({
		applicationId,
	});
	const { data: projects, isPending: isLoadingProjects } =
		api.snapvisor.projects.useQuery(undefined, { enabled: !!integration });
	const utils = api.useUtils();
	const { mutateAsync: setApplicationProject, isPending: isSaving } =
		api.snapvisor.setApplicationProject.useMutation();

	if (isLoadingIntegration) return null;

	if (!integration) {
		return (
			<div className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-xs text-sm text-muted-foreground">
				<span>
					Connect Snapvisor in{" "}
					<a href="/dashboard/settings/integrations" className="underline">
						Settings → Integrations
					</a>{" "}
					to show visual-diff status on this application&apos;s previews.
				</span>
				<LearnMoreLink
					href={INTEGRATION_LEARN_MORE_URLS.snapvisor}
					className="shrink-0"
				/>
			</div>
		);
	}

	const onChange = async (value: string) => {
		const projectName = value === SNAPVISOR_OFF ? null : value;
		await setApplicationProject({ applicationId, projectName })
			.then(async () => {
				toast.success(
					projectName
						? `Visual testing linked to "${projectName}"`
						: "Visual testing turned off",
				);
				await utils.application.one.invalidate({ applicationId });
			})
			.catch((error) => {
				toast.error("Error updating the Snapvisor project", {
					description: error.message,
				});
			});
	};

	return (
		<div className="flex flex-col gap-2 p-3 border rounded-lg shadow-xs">
			<div className="flex flex-row items-center justify-between">
				<div className="flex flex-row items-start gap-3">
					<SnapvisorMark className="size-8 shrink-0" />
					<div className="space-y-0.5">
						<FormLabel>Visual testing (Snapvisor)</FormLabel>
						<FormDescription>
							Register each preview deployment with a Snapvisor project so its
							visual-diff status shows on the preview card.
						</FormDescription>
					</div>
				</div>
			</div>
			<Select
				value={application?.snapvisorProjectName ?? SNAPVISOR_OFF}
				onValueChange={onChange}
				disabled={isSaving || isLoadingProjects}
			>
				<SelectTrigger>
					<SelectValue placeholder="Off" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={SNAPVISOR_OFF}>Off</SelectItem>
					{projects?.map((project) => (
						<SelectItem key={project.id} value={project.name}>
							{project.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="flex flex-row items-center justify-between gap-2">
				<LearnMoreLink href={INTEGRATION_LEARN_MORE_URLS.snapvisor} />
				<PoweredBySnapvisor />
			</div>
		</div>
	);
};

const schema = z
	.object({
		env: z.string(),
		buildArgs: z.string(),
		buildSecrets: z.string(),
		wildcardDomain: z
			.string()
			.refine(isValidPreviewWildcard, { message: PREVIEW_WILDCARD_GUIDANCE }),
		port: z.number(),
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
	applicationId: string;
}

export const ShowPreviewSettings = ({ applicationId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isEnabled, setIsEnabled] = useState(false);
	const { mutateAsync: updateApplication, isPending } =
		api.application.update.useMutation();

	const { data, refetch } = api.application.one.useQuery({ applicationId });

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
			port: 3000,
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
		const exampleVars: Record<string, string> = {
			appName,
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
			result = result.replace("*", `${appName}-a1b2c3`);
		} else {
			result = result.replace("*", appName);
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
				buildArgs: data.previewBuildArgs || "",
				buildSecrets: data.previewBuildSecrets || "",
				wildcardDomain: data.previewWildcard || defaultWildcard,
				port: data.previewPort || 3000,
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
		updateApplication({
			previewEnv: formData.env,
			previewBuildArgs: formData.buildArgs,
			previewBuildSecrets: formData.buildSecrets,
			previewWildcard: formData.wildcardDomain,
			previewPort: formData.port,
			previewLabels: formData.previewLabels,
			applicationId,
			previewLimit: formData.previewLimit,
			previewHttps: formData.previewHttps,
			previewPath: formData.previewPath,
			previewCertificateType: formData.previewCertificateType,
			previewCustomCertResolver: formData.previewCustomCertResolver,
			previewRequireCollaboratorPermissions:
				formData.previewRequireCollaboratorPermissions,
		})
			.then(() => {
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
							Adjust the settings for preview deployments of this application,
							including environment variables, build options, and deployment
							rules.
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
								id="hook-form-delete-application"
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
														custom patterns. If the template includes{" "}
														<code className="text-xs">{"${prNumber}"}</code> or{" "}
														<code className="text-xs">{"${branchName}"}</code>,
														no random suffix is appended.
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
										name="port"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Port</FormLabel>
												<FormControl>
													<NumberInput placeholder="3000" {...field} />
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
																	Add a labels that will trigger a preview
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
										name="previewLimit"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Preview Limit</FormLabel>
												<FormControl>
													<NumberInput placeholder="3000" {...field} />
												</FormControl>
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
													<FormLabel>Certificate Provider</FormLabel>
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
												Enable or disable preview deployments for this
												application.
											</FormDescription>
										</div>
										<Switch
											checked={isEnabled}
											onCheckedChange={(checked) => {
												updateApplication({
													isPreviewDeploymentsActive: checked,
													applicationId,
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
									<div className="col-span-2">
										<SnapvisorPreviewSettingSection applicationId={applicationId} />
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
															You can add environment variables to your
															resource. Use{" "}
															<code>{"${{preview.prNumber}}"}</code> to
															reference the pull request number, e.g. to point
															at another service's deterministic preview domain
															(
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
								{data?.buildType === "dockerfile" && (
									<Secrets
										name="buildArgs"
										title="Build-time Arguments"
										description={
											<span>
												Arguments are available only at build-time. See
												documentation&nbsp;
												<a
													className="text-primary"
													href="https://docs.docker.com/build/building/variables/"
													target="_blank"
													rel="noopener noreferrer"
												>
													here
												</a>
												.
											</span>
										}
										placeholder="NPM_TOKEN=xyz"
									/>
								)}
								{data?.buildType === "dockerfile" && (
									<Secrets
										name="buildSecrets"
										title="Build-time Secrets"
										description={
											<span>
												Secrets are specially designed for sensitive information
												and are only available at build-time. See
												documentation&nbsp;
												<a
													className="text-primary"
													href="https://docs.docker.com/build/building/secrets/"
													target="_blank"
													rel="noopener noreferrer"
												>
													here
												</a>
												.
											</span>
										}
										placeholder="NPM_TOKEN=xyz"
									/>
								)}
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
							form="hook-form-delete-application"
							type="submit"
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{/* */}
		</div>
	);
};
