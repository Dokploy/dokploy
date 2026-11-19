import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Dices } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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

	const form = useForm<Domain>({
		resolver: zodResolver(domain),
	});

	const host = form.watch("host");
	const isTraefikMeDomain = host?.includes("sslip.io") || false;

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
	}, [form, form.reset, data, isPending]);

	const dictionary = {
		success: domainId
			? t("application.domains.updated")
			: t("application.domains.created"),
		error: domainId
			? t("application.domains.updateError")
			: t("application.domains.createError"),
		submit: domainId
			? t("application.domains.update")
			: t("application.domains.create"),
		dialogDescription: domainId
			? t("application.domains.editDescription")
			: t("application.domains.addDescription"),
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
					<DialogTitle>{t("application.domains.title")}</DialogTitle>
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
											{isTraefikMeDomain && (
												<AlertBlock type="info">
													<strong>{t("application.domains.note")}</strong>{" "}
													{t("application.domains.sslipNote")}
												</AlertBlock>
											)}
											<FormLabel>{t("application.domains.host")}</FormLabel>
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
															className="max-w-40"
														>
															<p>{t("application.domains.generateDomain")}</p>
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
												<FormLabel>{t("application.domains.path")}</FormLabel>
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
												<FormLabel>
													{t("application.domains.containerPort")}
												</FormLabel>
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
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-xs">
											<div className="space-y-0.5">
												<FormLabel>{t("application.domains.https")}</FormLabel>
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

								{form.getValues().https && (
									<FormField
										control={form.control}
										name="certificateType"
										render={({ field }) => (
											<FormItem className="col-span-2">
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
							{dictionary.submit}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
