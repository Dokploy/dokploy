import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Dices } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const createPreviewDomainSchema = (
	t: ReturnType<typeof useTranslations<"applicationPreview">>,
) =>
	z
		.object({
			host: z
				.string()
				.min(1, { message: t("domain.validation.hostnameRequired") })
				.refine((val) => val === val.trim(), {
					message: t("domain.validation.hostTrim"),
				})
				.transform((val) => val.trim()),
			path: z.string().min(1).optional(),
			port: z
				.number()
				.min(1, { message: t("domain.validation.portMin") })
				.max(65535, { message: t("domain.validation.portMax") })
				.optional(),
			https: z.boolean().optional(),
			certificateType: z.enum(["letsencrypt", "none", "custom"]).optional(),
			customCertResolver: z.string().optional(),
		})
		.superRefine((input, ctx) => {
			if (input.https && !input.certificateType) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["certificateType"],
					message: t("domain.validation.required"),
				});
			}

			if (input.certificateType === "custom" && !input.customCertResolver) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["customCertResolver"],
					message: t("domain.validation.required"),
				});
			}
		});

type PreviewDomainForm = z.infer<ReturnType<typeof createPreviewDomainSchema>>;

interface Props {
	previewDeploymentId: string;
	domainId?: string;
	children: React.ReactNode;
}

export const AddPreviewDomain = ({
	previewDeploymentId,
	domainId = "",
	children,
}: Props) => {
	const t = useTranslations("applicationPreview");
	const previewDomainSchema = useMemo(() => createPreviewDomainSchema(t), [t]);

	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { data, refetch } = api.domain.one.useQuery(
		{
			domainId,
		},
		{
			enabled: !!domainId,
		},
	);

	const { data: previewDeployment } = api.previewDeployment.one.useQuery(
		{
			previewDeploymentId,
		},
		{
			enabled: !!previewDeploymentId,
		},
	);

	const { mutateAsync, isError, error, isPending } = domainId
		? api.domain.update.useMutation()
		: api.domain.create.useMutation();

	const { mutateAsync: generateDomain, isPending: isLoadingGenerate } =
		api.domain.generateDomain.useMutation();

	const form = useForm<PreviewDomainForm>({
		resolver: zodResolver(previewDomainSchema),
	});

	const host = form.watch("host");
	const isTraefikMeDomain = host?.includes("traefik.me") || false;

	useEffect(() => {
		if (data) {
			form.reset({
				...data,
				path: data?.path || undefined,
				port: data?.port || undefined,
				customCertResolver: data?.customCertResolver || undefined,
			});
		}

		if (!domainId) {
			form.reset({});
		}
	}, [form, form.reset, data, isPending, domainId]);

	const onSubmit = async (formData: PreviewDomainForm) => {
		await mutateAsync({
			domainId,
			previewDeploymentId,
			...formData,
		})
			.then(async () => {
				toast.success(
					domainId
						? t("domain.toastUpdateSuccess")
						: t("domain.toastCreateSuccess"),
				);
				await utils.previewDeployment.all.invalidate({
					applicationId: previewDeployment?.applicationId,
				});

				if (domainId) {
					refetch();
				}
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					domainId
						? t("domain.toastUpdateError")
						: t("domain.toastCreateError"),
				);
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("domain.dialogTitle")}</DialogTitle>
					<DialogDescription>
						{domainId
							? t("domain.dialogEditDescription")
							: t("domain.dialogCreateDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="host"
									render={({ field }) => (
										<FormItem>
											{isTraefikMeDomain && (
												<AlertBlock type="info">
													{t.rich("shared.traefikMeNote", {
														strong: (chunks) => <strong>{chunks}</strong>,
													})}
												</AlertBlock>
											)}
											<FormLabel>{t("domain.host")}</FormLabel>
											<div className="flex gap-2">
												<FormControl>
													<Input
														placeholder={t("domain.hostPlaceholder")}
														{...field}
													/>
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
																		appName: previewDeployment?.appName || "",
																		serverId:
																			previewDeployment?.application
																				?.serverId || "",
																	})
																		.then((domain) => {
																			field.onChange(domain);
																		})
																		.catch((err: Error) => {
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
															<p>{t("domain.generateDomainTooltip")}</p>
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
												<FormLabel>{t("domain.path")}</FormLabel>
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
									name="port"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>{t("domain.containerPort")}</FormLabel>
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
									name="https"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>{t("domain.https")}</FormLabel>
												<FormDescription>
													{t("domain.httpsDescription")}
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

								{form.getValues().https && (
									<FormField
										control={form.control}
										name="certificateType"
										render={({ field }) => (
											<FormItem className="col-span-2">
												<FormLabel>{t("domain.certificateProvider")}</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue
																placeholder={t(
																	"domain.selectCertificateProvider",
																)}
															/>
														</SelectTrigger>
													</FormControl>

													<SelectContent>
														<SelectItem value="none">
															{t("domain.certNone")}
														</SelectItem>
														<SelectItem value={"letsencrypt"}>
															{t("domain.certLetsencrypt")}
														</SelectItem>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button isLoading={isPending} form="hook-form" type="submit">
							{domainId ? t("domain.submitUpdate") : t("domain.submitCreate")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
