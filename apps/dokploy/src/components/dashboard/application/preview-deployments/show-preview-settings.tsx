import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { HelpCircle, Plus, Settings2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
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

const createPreviewSettingsSchema = (
	t: ReturnType<typeof useTranslations<"applicationPreview">>,
) =>
	z
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
					message: t("settings.validation.customCertResolverRequired"),
				});
			}
		});

type Schema = z.infer<ReturnType<typeof createPreviewSettingsSchema>>;

interface Props {
	applicationId: string;
}

export const ShowPreviewSettings = ({ applicationId }: Props) => {
	const t = useTranslations("applicationPreview");
	const tCommon = useTranslations("common");
	const previewLabelInputRef = useRef<HTMLInputElement>(null);
	const previewSettingsSchema = useMemo(
		() => createPreviewSettingsSchema(t),
		[t],
	);

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
		resolver: zodResolver(previewSettingsSchema),
	});

	const previewHttps = form.watch("previewHttps");
	const wildcardDomain = form.watch("wildcardDomain");
	const isTraefikMeDomain = wildcardDomain?.includes("traefik.me") || false;

	useEffect(() => {
		setIsEnabled(data?.isPreviewDeploymentsActive || false);
	}, [data?.isPreviewDeploymentsActive]);

	useEffect(() => {
		if (data) {
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
		}
	}, [data, form]);

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
				toast.success(t("settings.toastSuccess"));
			})
			.catch((error: Error) => {
				toast.error(error.message);
			});
	};
	return (
		<div>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button variant="outline">
						<Settings2 className="size-4" />
						{t("settings.configure")}
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-5xl w-full">
					<DialogHeader>
						<DialogTitle>{t("settings.dialogTitle")}</DialogTitle>
						<DialogDescription>
							{t("settings.dialogDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4">
						{isTraefikMeDomain && (
							<AlertBlock type="info">
								{t.rich("shared.traefikMeNote", {
									strong: (chunks) => <strong>{chunks}</strong>,
								})}
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
												<FormLabel>{t("settings.wildcardDomain")}</FormLabel>
												<FormControl>
													<Input
														placeholder={t("settings.wildcardPlaceholder")}
														{...field}
													/>
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
												<FormLabel>{t("settings.previewPath")}</FormLabel>
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
												<FormLabel>{t("settings.port")}</FormLabel>
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
													<FormLabel>{t("settings.previewLabels")}</FormLabel>
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
															</TooltipTrigger>
															<TooltipContent>
																<p>{t("settings.previewLabelsTooltip")}</p>
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
															ref={previewLabelInputRef}
															placeholder={t(
																"settings.previewLabelPlaceholder",
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
															const input = previewLabelInputRef.current;
															if (!input) return;
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
												<FormLabel>{t("settings.previewLimit")}</FormLabel>
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
											<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
												<div className="space-y-0.5">
													<FormLabel>{t("settings.https")}</FormLabel>
													<FormDescription>
														{t("settings.httpsDescription")}
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
														{t("settings.certificateProvider")}
													</FormLabel>
													<Select
														onValueChange={field.onChange}
														defaultValue={field.value || ""}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue
																	placeholder={t(
																		"settings.selectCertificateProvider",
																	)}
																/>
															</SelectTrigger>
														</FormControl>

														<SelectContent>
															<SelectItem value="none">
																{t("settings.certNone")}
															</SelectItem>
															<SelectItem value={"letsencrypt"}>
																{t("settings.certLetsencrypt")}
															</SelectItem>
															<SelectItem value={"custom"}>
																{t("settings.certCustom")}
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
														{t("settings.certificateProvider")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t(
																"settings.customResolverPlaceholder",
															)}
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
												{t("settings.enablePreviewTitle")}
											</FormLabel>
											<FormDescription>
												{t("settings.enablePreviewDescription")}
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
																? t("settings.toastPreviewEnabled")
																: t("settings.toastPreviewDisabled"),
														);
													})
													.catch((error: Error) => {
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
											<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm col-span-2">
												<div className="space-y-0.5">
													<FormLabel>
														{t("settings.requireCollaboratorTitle")}
													</FormLabel>
													<FormDescription>
														{t("settings.requireCollaboratorDescription")}
														<ul className="list-disc pl-4 mt-1">
															<li>{t("settings.roleAdmin")}</li>
															<li>{t("settings.roleMaintain")}</li>
															<li>{t("settings.roleWrite")}</li>
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
													title={t("settings.envTitle")}
													description={t("settings.envDescription")}
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
										title={t("settings.buildArgsTitle")}
										description={t.rich("settings.buildArgsDescriptionRich", {
											link: (chunks) => (
												<a
													className="text-primary"
													href="https://docs.docker.com/build/building/variables/"
													target="_blank"
													rel="noopener noreferrer"
												>
													{chunks}
												</a>
											),
										})}
										placeholder={t("settings.buildPlaceholder")}
									/>
								)}
								{data?.buildType === "dockerfile" && (
									<Secrets
										name="buildSecrets"
										title={t("settings.buildSecretsTitle")}
										description={t.rich(
											"settings.buildSecretsDescriptionRich",
											{
												link: (chunks) => (
													<a
														className="text-primary"
														href="https://docs.docker.com/build/building/secrets/"
														target="_blank"
														rel="noopener noreferrer"
													>
														{chunks}
													</a>
												),
											},
										)}
										placeholder={t("settings.buildPlaceholder")}
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
							{tCommon("cancel")}
						</Button>
						<Button
							isLoading={isPending}
							form="hook-form-delete-application"
							type="submit"
						>
							{tCommon("save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};
