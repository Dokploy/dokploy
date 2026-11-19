import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { HelpCircle, Plus, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
				message: "application.previewDeployment.required",
			});
		}
	});

type Schema = z.infer<typeof schema>;

interface Props {
	applicationId: string;
}

export const ShowPreviewSettings = ({ applicationId }: Props) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [isEnabled, setIsEnabled] = useState(false);
	const { mutateAsync: updateApplication, isPending } =
		api.application.update.useMutation();

	const { data, refetch } = api.application.one.useQuery({ applicationId });
	const { data: haveValidLicense } =
		api.licenseKey.haveValidLicenseKey.useQuery();
	const { mutateAsync: setPreviewForwardAuth, isPending: isSettingSso } =
		api.forwardAuth.setPreviewEnabled.useMutation();

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

	useEffect(() => {
		setIsEnabled(data?.isPreviewDeploymentsActive || false);
	}, [data?.isPreviewDeploymentsActive]);

	useEffect(() => {
		if (data) {
			form.reset({
				env: data.previewEnv || "",
				buildArgs: data.previewBuildArgs || "",
				buildSecrets: data.previewBuildSecrets || "",
				wildcardDomain: data.previewWildcard || "*.sslip.io",
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
	}, [data]);

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
				toast.success(t("application.previewDeployment.settingsUpdated"));
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
						{t("application.previewDeployment.configure")}
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-5xl w-full">
					<DialogHeader>
						<DialogTitle>
							{t("application.previewDeployment.settingsTitle")}
						</DialogTitle>
						<DialogDescription>
							{t("application.previewDeployment.settingsDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4">
						{isTraefikMeDomain && (
							<AlertBlock type="info">
								<strong>{t("application.domains.note")}</strong>{" "}
								{t("application.domains.sslipNote")}
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
											<FormItem>
												<FormLabel>
													{t("application.previewDeployment.wildcardDomain")}
												</FormLabel>
												<FormControl>
													<Input placeholder="*.sslip.io" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="previewPath"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("application.previewDeployment.previewPath")}
												</FormLabel>
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
												<FormLabel>
													{t("application.previewDeployment.port")}
												</FormLabel>
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
													<FormLabel>
														{t("application.previewDeployment.previewLabels")}
													</FormLabel>
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
															</TooltipTrigger>
															<TooltipContent>
																<p>
																	{t(
																		"application.previewDeployment.previewLabelsTooltip",
																	)}
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
															placeholder={t(
																"application.previewDeployment.labelPlaceholder",
															)}
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
												<FormLabel>
													{t("application.previewDeployment.previewLimit")}
												</FormLabel>
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
													<FormLabel>
														{t("application.domains.https")}
													</FormLabel>
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
									{previewHttps && (
										<FormField
											control={form.control}
											name="previewCertificateType"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("application.domains.certificateProvider")}
													</FormLabel>
													<Select
														onValueChange={field.onChange}
														defaultValue={field.value || ""}
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
															<SelectItem value="none">
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
													<FormLabel>
														{t("application.domains.certificateProvider")}
													</FormLabel>
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
												{t("application.previewDeployment.enable")}
											</FormLabel>
											<FormDescription>
												{t("application.previewDeployment.enableDescription")}
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
																? t(
																		"application.previewDeployment.enabledToast",
																	)
																: t(
																		"application.previewDeployment.disabledToast",
																	),
														);
													})
													.catch((error) => {
														toast.error(error.message);
													});
											}}
										/>
									</div>
								</div>

								{(haveValidLicense || data?.previewForwardAuthEnabled) && (
									<div className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">
												{t("application.previewDeployment.protectWithSso")}
											</FormLabel>
											<FormDescription>
												{t(
													"application.previewDeployment.protectWithSsoDescription",
												)}
											</FormDescription>
										</div>
										<Switch
											checked={data?.previewForwardAuthEnabled ?? false}
											disabled={isSettingSso}
											onCheckedChange={(checked) => {
												setPreviewForwardAuth({
													applicationId,
													enabled: checked,
												})
													.then(() => {
														refetch();
														toast.success(
															checked
																? t("application.previewDeployment.ssoEnabled")
																: t(
																		"application.previewDeployment.ssoDisabled",
																	),
														);
													})
													.catch((error) => {
														toast.error(error.message);
													});
											}}
										/>
									</div>
								)}

								<div className="grid gap-4 lg:grid-cols-2">
									<FormField
										control={form.control}
										name="previewRequireCollaboratorPermissions"
										render={({ field }) => (
											<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-xs col-span-2">
												<div className="space-y-0.5">
													<FormLabel>
														{t(
															"application.previewDeployment.requireCollaborator",
														)}
													</FormLabel>
													<FormDescription>
														{t(
															"application.previewDeployment.requireCollaboratorDescription",
														)}
														<ul>
															<li>Admin</li>
															<li>Maintain</li>
															<li>Write</li>
														</ul>
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

								<FormField
									control={form.control}
									name="env"
									render={() => (
										<FormItem>
											<FormControl>
												<Secrets
													name="env"
													title={t("application.environment.title")}
													description={t("application.environment.description")}
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
										title={t("application.environment.buildArgsTitle")}
										description={
											<span>
												{t("application.environment.buildArgsDescription")}
												&nbsp;
												<a
													className="text-primary"
													href="https://docs.docker.com/build/building/variables/"
													target="_blank"
													rel="noopener noreferrer"
												>
													{t("application.environment.documentationHere")}
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
										title={t("application.environment.buildSecretsTitle")}
										description={
											<span>
												{t("application.environment.buildSecretsDescription")}
												&nbsp;
												<a
													className="text-primary"
													href="https://docs.docker.com/build/building/secrets/"
													target="_blank"
													rel="noopener noreferrer"
												>
													{t("application.environment.documentationHere")}
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
							{t("application.previewDeployment.cancel")}
						</Button>
						<Button
							isLoading={isPending}
							form="hook-form-delete-application"
							type="submit"
						>
							{t("application.previewDeployment.save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{/* */}
		</div>
	);
};
