import { zodResolver } from "@hookform/resolvers/zod";
import { Dices } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type z from "zod";
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
import { domain } from "@/server/db/validations/domain";
import { api } from "@/utils/api";

type Domain = z.infer<typeof domain>;

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
	const [isOpen, setIsOpen] = useState(false);
	const { t } = useTranslation("common");
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

	const { mutateAsync, isError, error, isLoading } = domainId
		? api.domain.update.useMutation()
		: api.domain.create.useMutation();

	const { mutateAsync: generateDomain, isLoading: isLoadingGenerate } =
		api.domain.generateDomain.useMutation();

	const form = useForm<Domain>({
		resolver: zodResolver(domain),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				...data,
				/* Convert null to undefined */
				path: data?.path || undefined,
				port: data?.port || undefined,
				customCertResolver: data?.customCertResolver || undefined,
			});
		}

		if (!domainId) {
			form.reset({});
		}
	}, [form, form.reset, data, isLoading]);

	const dictionary = {
		success: domainId
			? t("preview.domain.toast.updateSuccess")
			: t("preview.domain.toast.createSuccess"),
		error: domainId
			? t("preview.domain.toast.updateError")
			: t("preview.domain.toast.createError"),
		submit: domainId
			? t("preview.domain.button.update")
			: t("preview.domain.button.create"),
		dialogDescription: domainId
			? t("preview.domain.dialog.description.edit")
			: t("preview.domain.dialog.description.create"),
	};

	const onSubmit = async (data: Domain) => {
		await mutateAsync({
			domainId,
			previewDeploymentId,
			...data,
		})
			.then(async () => {
				toast.success(dictionary.success);
				await utils.previewDeployment.all.invalidate({
					applicationId: previewDeployment?.applicationId,
				});

				if (domainId) {
					refetch();
				}
				setIsOpen(false);
			})
			.catch(() => {
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
					<DialogTitle>{t("preview.domain.dialog.title")}</DialogTitle>
					<DialogDescription>{dictionary.dialogDescription}</DialogDescription>
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
											<FormLabel>{t("preview.domain.field.host")}</FormLabel>
											<div className="flex gap-2">
												<FormControl>
													<Input
														placeholder={t("preview.domain.field.hostPlaceholder")}
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
															<p>{t("preview.domain.tooltip.generateTraefikDomain")}</p>
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
												<FormLabel>{t("preview.domain.field.path")}</FormLabel>
												<FormControl>
													<Input
														placeholder={t("preview.domain.field.pathPlaceholder")}
														{...field}
													/>
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
												<FormLabel>{t("preview.domain.field.port")}</FormLabel>
												<FormControl>
													<NumberInput
														placeholder={t("preview.domain.field.portPlaceholder")}
														{...field}
													/>
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
												<FormLabel>{t("preview.domain.field.https")}</FormLabel>
												<FormDescription>
													{t("preview.domain.field.httpsDescription")}
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
												<FormLabel>{t("preview.domain.certificate.label")}</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue
																placeholder={t("preview.domain.certificate.placeholder")}
															/>
														</SelectTrigger>
													</FormControl>

													<SelectContent>
														<SelectItem value="none">
															{t("preview.domain.certificate.option.none")}
														</SelectItem>
														<SelectItem value={"letsencrypt"}>
															{t("preview.domain.certificate.option.letsencrypt")}
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
						<Button isLoading={isLoading} form="hook-form" type="submit">
							{dictionary.submit}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
