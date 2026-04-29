import {
	injectDynamicDnsIp,
	isPreviewTemplateMode,
	resolvePreviewDomainTemplate,
	resolvePreviewPathTemplate,
	resolveWildcardDomain,
} from "@dokploy/server/utils/traefik/preview-domain";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { HelpCircle, Plus, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const PREVIEW_VARIABLES = ["appname", "branch", "pr", "hash"] as const;

const findUnknownTokens = (value: string) => {
	const matches = value.match(/\{(\w+)\}/g) ?? [];
	return matches.filter((m) => {
		const key = m.slice(1, -1).toLowerCase();
		return !(PREVIEW_VARIABLES as readonly string[]).includes(key);
	});
};

const schema = z
	.object({
		env: z.string(),
		buildArgs: z.string(),
		buildSecrets: z.string(),
		wildcardDomain: z.string(),
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
		if (
			input.wildcardDomain.includes("*") &&
			input.wildcardDomain.includes("{")
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["wildcardDomain"],
				message:
					'Use either a wildcard "*" or {variables}, not both. Mixed templates leave unresolved tokens in the generated URL.',
			});
		}
		const unknownDomainTokens = findUnknownTokens(input.wildcardDomain);
		if (unknownDomainTokens.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["wildcardDomain"],
				message: `Unknown variable${unknownDomainTokens.length > 1 ? "s" : ""} ${unknownDomainTokens.join(", ")}. Supported: {appname}, {branch}, {pr}, {hash}.`,
			});
		}
		const unknownPathTokens = findUnknownTokens(input.previewPath);
		if (unknownPathTokens.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["previewPath"],
				message: `Unknown variable${unknownPathTokens.length > 1 ? "s" : ""} ${unknownPathTokens.join(", ")}. Supported: {appname}, {branch}, {pr}, {hash}.`,
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

	const form = useForm<Schema>({
		defaultValues: {
			env: "",
			wildcardDomain: "*.traefik.me",
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

	const wildcardDomainInputRef = useRef<HTMLInputElement | null>(null);
	const previewPathInputRef = useRef<HTMLInputElement | null>(null);
	const insertVariable = (
		fieldName: "wildcardDomain" | "previewPath",
		input: HTMLInputElement | null,
		name: string,
	) => {
		const current = form.getValues(fieldName) ?? "";
		const token = `{${name}}`;
		const start = input?.selectionStart ?? current.length;
		const end = input?.selectionEnd ?? current.length;
		const next = current.slice(0, start) + token + current.slice(end);
		form.setValue(fieldName, next, {
			shouldDirty: true,
			shouldValidate: true,
		});
		const cursor = start + token.length;
		queueMicrotask(() => {
			input?.focus();
			input?.setSelectionRange(cursor, cursor);
		});
	};

	const previewHttps = form.watch("previewHttps");
	const wildcardDomain = form.watch("wildcardDomain");
	const watchedPreviewPath = form.watch("previewPath");
	const isTraefikMeDomain = wildcardDomain?.includes("traefik.me") || false;
	const isTemplateMode = isPreviewTemplateMode(wildcardDomain || "");
	const previewExample = (() => {
		if (!wildcardDomain) return { url: "", error: "" };
		const sampleAppName = `preview-${data?.appName ?? "app"}-a1b2c3`;
		const slugIp = (data?.server?.ipAddress || "127.0.0.1").replaceAll(
			".",
			"-",
		);
		let host: string;
		try {
			if (isTemplateMode) {
				host = injectDynamicDnsIp(
					resolvePreviewDomainTemplate(wildcardDomain, {
						appName: sampleAppName,
						branch: "feat/new-login",
						pr: "42",
						hash: "a1b2c3",
					}),
					slugIp,
				);
			} else if (wildcardDomain.includes("*")) {
				host = resolveWildcardDomain(wildcardDomain, sampleAppName, slugIp);
			} else {
				host = injectDynamicDnsIp(wildcardDomain, slugIp);
			}
		} catch (err) {
			return {
				url: "",
				error: err instanceof Error ? err.message : "Invalid domain template",
			};
		}

		const scheme = previewHttps && !isTraefikMeDomain ? "https://" : "http://";
		let resolvedPath: string;
		try {
			resolvedPath = resolvePreviewPathTemplate(
				watchedPreviewPath?.trim() || "/",
				{
					appName: sampleAppName,
					branch: "feat/new-login",
					pr: "42",
					hash: "a1b2c3",
				},
			);
		} catch (err) {
			return {
				url: "",
				error: err instanceof Error ? err.message : "Invalid path template",
			};
		}
		const path = resolvedPath.startsWith("/")
			? resolvedPath
			: `/${resolvedPath}`;
		return {
			url: `${scheme}${host}${path === "/" ? "" : path}`,
			error: "",
		};
	})();

	useEffect(() => {
		setIsEnabled(data?.isPreviewDeploymentsActive || false);
	}, [data?.isPreviewDeploymentsActive]);

	useEffect(() => {
		if (isTraefikMeDomain && form.getValues("previewHttps")) {
			form.setValue("previewHttps", false, { shouldDirty: true });
		}
	}, [isTraefikMeDomain, form]);

	// Only seed the form from server state once per modal open — otherwise
	// toggling `Enable preview deployments` (which refetches `data`) would wipe
	// any in-progress edits.
	const hasSeededForm = useRef(false);
	useEffect(() => {
		if (!isOpen) {
			hasSeededForm.current = false;
			return;
		}
		if (data && !hasSeededForm.current) {
			form.reset({
				env: data.previewEnv || "",
				buildArgs: data.previewBuildArgs || "",
				buildSecrets: data.previewBuildSecrets || "",
				wildcardDomain: data.previewWildcard || "*.traefik.me",
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
			hasSeededForm.current = true;
		}
	}, [isOpen, data, form]);

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
			.then(async () => {
				await refetch();
				toast.success("Preview Deployments settings updated");
				setIsOpen(false);
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
					<div className="grid gap-6 max-h-[75vh] overflow-y-auto pr-1">
						<div className="flex flex-row items-center justify-between rounded-lg border p-4">
							<div className="space-y-0.5">
								<div className="text-base font-medium leading-none">
									Enable preview deployments
								</div>
								<p className="text-sm text-muted-foreground">
									Enable or disable preview deployments for this application.
								</p>
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
						{!isEnabled && (
							<AlertBlock type="info">
								Preview deployments are disabled. Enable them above to configure
								settings, then press Save.
							</AlertBlock>
						)}
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-delete-application"
								className={cn(
									"grid w-full gap-4 transition-opacity",
									!isEnabled && "opacity-50 pointer-events-none select-none",
								)}
								aria-disabled={!isEnabled}
							>
								<div className="grid gap-4 lg:grid-cols-2">
									<div className="md:col-span-2 space-y-1">
										<h3 className="text-sm font-semibold">Routing</h3>
										<p className="text-xs text-muted-foreground">
											Configure the hostname, path, and port for each generated
											preview.
										</p>
									</div>
									<FormField
										control={form.control}
										name="wildcardDomain"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Domain Template</FormLabel>
												<FormControl>
													<Input
														placeholder="*.traefik.me"
														{...field}
														ref={(el) => {
															field.ref(el);
															wildcardDomainInputRef.current = el;
														}}
													/>
												</FormControl>
												<FormDescription className="space-y-2">
													<span className="block">
														Use <code>*</code> for the legacy wildcard, or{" "}
														<code>{"{variables}"}</code> for a custom pattern.
													</span>
													<span className="flex flex-wrap items-center gap-1.5">
														<span className="text-xs text-muted-foreground">
															Insert:
														</span>
														{PREVIEW_VARIABLES.map((name) => (
															<Badge
																key={name}
																variant="secondary"
																className="cursor-pointer font-mono text-xs hover:bg-secondary/80"
																onClick={() =>
																	insertVariable(
																		"wildcardDomain",
																		wildcardDomainInputRef.current,
																		name,
																	)
																}
															>
																{`{${name}}`}
															</Badge>
														))}
													</span>
													<span className="block text-xs">
														Dynamic DNS auto-detected for traefik.me, nip.io,
														sslip.io, backname.io.
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
												<FormLabel>Path</FormLabel>
												<FormControl>
													<Input
														placeholder="/"
														{...field}
														ref={(el) => {
															field.ref(el);
															previewPathInputRef.current = el;
														}}
													/>
												</FormControl>
												<FormDescription className="space-y-2">
													<span className="block">
														Supports the same <code>{"{variables}"}</code> —
														e.g. <code>/pr-{"{pr}"}/</code>.
													</span>
													<span className="flex flex-wrap items-center gap-1.5">
														<span className="text-xs text-muted-foreground">
															Insert:
														</span>
														{PREVIEW_VARIABLES.map((name) => (
															<Badge
																key={name}
																variant="secondary"
																className="cursor-pointer font-mono text-xs hover:bg-secondary/80"
																onClick={() =>
																	insertVariable(
																		"previewPath",
																		previewPathInputRef.current,
																		name,
																	)
																}
															>
																{`{${name}}`}
															</Badge>
														))}
													</span>
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>
									{previewExample.error ? (
										<div className="md:col-span-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
											<div className="text-xs font-medium uppercase tracking-wide text-destructive">
												Invalid template
											</div>
											<div className="mt-1 text-sm text-destructive break-words">
												{previewExample.error}
											</div>
										</div>
									) : previewExample.url ? (
										<div className="md:col-span-2 rounded-md border bg-muted/40 px-3 py-2">
											<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
												Example preview URL
											</div>
											<div className="mt-1 font-mono text-sm break-all text-foreground">
												{previewExample.url}
											</div>
											<div className="mt-1 text-xs text-muted-foreground">
												Using sample values <code>branch=feat/new-login</code>,{" "}
												<code>pr=42</code>, <code>hash=a1b2c3</code>.
											</div>
										</div>
									) : null}
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
												<FormDescription>
													The container port that your application listens on.
												</FormDescription>
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
												<FormDescription>
													Max concurrent preview deployments for this
													application.
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>
									<div className="md:col-span-2 space-y-1 mt-2">
										<h3 className="text-sm font-semibold">Triggers & Access</h3>
										<p className="text-xs text-muted-foreground">
											Control which pull requests spawn a preview and who can
											trigger one.
										</p>
									</div>
									<FormField
										control={form.control}
										name="previewRequireCollaboratorPermissions"
										render={({ field }) => (
											<FormItem className="md:col-span-2 flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
												<div className="space-y-0.5">
													<FormLabel>
														Require Collaborator Permissions
													</FormLabel>
													<FormDescription>
														Only collaborators with the Admin, Maintain, or
														Write role in your GitHub Repository can trigger
														preview deployments.
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
									<div className="md:col-span-2 space-y-1 mt-2">
										<h3 className="text-sm font-semibold">
											HTTPS &amp; Certificates
										</h3>
										<p className="text-xs text-muted-foreground">
											Choose how SSL is provisioned for preview domains.
										</p>
									</div>
									{isTraefikMeDomain && (
										<div className="md:col-span-2">
											<AlertBlock type="info">
												<strong>Note:</strong> traefik.me is a public HTTP
												service and does not support SSL/HTTPS. HTTPS and
												certificate options are disabled while this domain is in
												use. To use HTTPS, change your wildcard domain to a
												supported dynamic DNS provider (e.g.{" "}
												<code>*.sslip.io</code>) or a custom domain.
											</AlertBlock>
										</div>
									)}
									<FormField
										control={form.control}
										name="previewHttps"
										render={({ field }) => (
											<FormItem className="md:col-span-2 flex flex-row items-center justify-between p-3 border rounded-lg shadow-sm">
												<div className="space-y-0.5">
													<FormLabel>HTTPS</FormLabel>
													<FormDescription>
														Automatically provision an SSL certificate.
													</FormDescription>
													<FormMessage />
												</div>
												<FormControl>
													<Switch
														checked={field.value && !isTraefikMeDomain}
														onCheckedChange={field.onChange}
														disabled={isTraefikMeDomain}
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
												<FormItem
													className={
														form.watch("previewCertificateType") === "custom"
															? ""
															: "md:col-span-2"
													}
												>
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
													<FormDescription>
														Manage providers under{" "}
														<Link
															href="/dashboard/settings/certificates"
															target="_blank"
															className="text-primary underline-offset-2 hover:underline"
														>
															Settings → Certificates
														</Link>
														.
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}

									{previewHttps &&
										form.watch("previewCertificateType") === "custom" && (
											<FormField
												control={form.control}
												name="previewCustomCertResolver"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Custom Certificate Resolver</FormLabel>
														<FormControl>
															<Input
																placeholder="my-custom-resolver"
																{...field}
															/>
														</FormControl>
														<FormDescription>
															Name of a Traefik resolver defined in your Dokploy
															configuration.
														</FormDescription>
														<FormMessage />
													</FormItem>
												)}
											/>
										)}
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
													description="You can add environment variables to your resource."
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
							disabled={!isEnabled}
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
