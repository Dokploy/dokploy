import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

type FormValues = {
	name: string;
	prefix?: string;
	expiresIn: number | null;
	organizationId: string;
	rateLimitEnabled?: boolean;
	rateLimitTimeWindow: number | null;
	rateLimitMax: number | null;
	remaining?: number | null;
	refillAmount?: number | null;
	refillInterval?: number | null;
};

export const AddApiKey = () => {
	const t = useTranslations("addApiKey");
	const tToast = useTranslations("settingsExtraToasts");
	const [open, setOpen] = useState(false);
	const [showSuccessModal, setShowSuccessModal] = useState(false);
	const [newApiKey, setNewApiKey] = useState("");
	const { refetch } = api.user.get.useQuery();
	const { data: organizations } = api.organization.all.useQuery();

	const formSchema = useMemo(
		() =>
			z.object({
				name: z.string().min(1, t("nameRequired")),
				prefix: z.string().optional(),
				expiresIn: z.number().nullable(),
				organizationId: z.string().min(1, t("organizationRequired")),
				rateLimitEnabled: z.boolean().optional(),
				rateLimitTimeWindow: z.number().nullable(),
				rateLimitMax: z.number().nullable(),
				remaining: z.number().nullable().optional(),
				refillAmount: z.number().nullable().optional(),
				refillInterval: z.number().nullable().optional(),
			}),
		[t],
	);

	const expirationOptions = useMemo(
		() => [
			{ label: t("expiryNever"), value: "0" },
			{ label: t("expiry1Day"), value: String(60 * 60 * 24) },
			{ label: t("expiry7Days"), value: String(60 * 60 * 24 * 7) },
			{ label: t("expiry30Days"), value: String(60 * 60 * 24 * 30) },
			{ label: t("expiry90Days"), value: String(60 * 60 * 24 * 90) },
			{ label: t("expiry1Year"), value: String(60 * 60 * 24 * 365) },
		],
		[t],
	);

	const timeWindowOptions = useMemo(
		() => [
			{ label: t("timeWindow1Min"), value: String(60 * 1000) },
			{ label: t("timeWindow5Min"), value: String(5 * 60 * 1000) },
			{ label: t("timeWindow15Min"), value: String(15 * 60 * 1000) },
			{ label: t("timeWindow30Min"), value: String(30 * 60 * 1000) },
			{ label: t("timeWindow1Hour"), value: String(60 * 60 * 1000) },
			{ label: t("timeWindow1Day"), value: String(24 * 60 * 60 * 1000) },
		],
		[t],
	);

	const refillIntervalOptions = useMemo(
		() => [
			{ label: t("refill1Hour"), value: String(60 * 60 * 1000) },
			{ label: t("refill6Hours"), value: String(6 * 60 * 60 * 1000) },
			{ label: t("refill12Hours"), value: String(12 * 60 * 60 * 1000) },
			{ label: t("refill1Day"), value: String(24 * 60 * 60 * 1000) },
			{ label: t("refill7Days"), value: String(7 * 24 * 60 * 60 * 1000) },
			{ label: t("refill30Days"), value: String(30 * 24 * 60 * 60 * 1000) },
		],
		[t],
	);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			prefix: "",
			expiresIn: null,
			organizationId: "",
			rateLimitEnabled: false,
			rateLimitTimeWindow: null,
			rateLimitMax: null,
			remaining: null,
			refillAmount: null,
			refillInterval: null,
		},
	});

	const createApiKey = api.user.createApiKey.useMutation({
		onSuccess: (data) => {
			if (!data) return;

			setNewApiKey(data.key);
			setOpen(false);
			setShowSuccessModal(true);
			form.reset();
			void refetch();
		},
		onError: () => {
			toast.error(tToast("apiKeyGenerateFailed"));
		},
	});

	const rateLimitEnabled = form.watch("rateLimitEnabled");

	const onSubmit = async (values: FormValues) => {
		createApiKey.mutate({
			name: values.name,
			expiresIn: values.expiresIn || undefined,
			prefix: values.prefix || undefined,
			metadata: {
				organizationId: values.organizationId,
			},
			rateLimitEnabled: values.rateLimitEnabled,
			rateLimitTimeWindow: values.rateLimitTimeWindow || undefined,
			rateLimitMax: values.rateLimitMax || undefined,
			remaining: values.remaining || undefined,
			refillAmount: values.refillAmount || undefined,
			refillInterval: values.refillInterval || undefined,
		});
	};

	return (
		<>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button>{t("generateButton")}</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-xl max-h-[90vh]">
					<DialogHeader>
						<DialogTitle>{t("dialogTitle")}</DialogTitle>
						<DialogDescription>{t("dialogDescription")}</DialogDescription>
					</DialogHeader>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("nameLabel")}</FormLabel>
										<FormControl>
											<Input placeholder={t("namePlaceholder")} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="prefix"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("prefixLabel")}</FormLabel>
										<FormControl>
											<Input placeholder={t("prefixPlaceholder")} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="expiresIn"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("expirationLabel")}</FormLabel>
										<Select
											value={field.value?.toString() || "0"}
											onValueChange={(value) =>
												field.onChange(Number.parseInt(value, 10))
											}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t("expirationPlaceholder")}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{expirationOptions.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
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
								name="organizationId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("organizationLabel")}</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t("organizationPlaceholder")}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{organizations?.map((org) => (
													<SelectItem key={org.id} value={org.id}>
														{org.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="space-y-4 rounded-lg border p-4">
								<h3 className="text-lg font-medium">
									{t("rateLimitingTitle")}
								</h3>
								<FormField
									control={form.control}
									name="rateLimitEnabled"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
											<div className="space-y-0.5">
												<FormLabel>{t("enableRateLimitLabel")}</FormLabel>
												<FormDescription>
													{t("enableRateLimitDescription")}
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

								{rateLimitEnabled && (
									<>
										<FormField
											control={form.control}
											name="rateLimitTimeWindow"
											render={({ field }) => (
												<FormItem>
													<FormLabel>{t("timeWindowLabel")}</FormLabel>
													<Select
														value={field.value?.toString()}
														onValueChange={(value) =>
															field.onChange(Number.parseInt(value, 10))
														}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue
																	placeholder={t("timeWindowPlaceholder")}
																/>
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{timeWindowOptions.map((option) => (
																<SelectItem
																	key={option.value}
																	value={option.value}
																>
																	{option.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<FormDescription>
														{t("timeWindowDescription")}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="rateLimitMax"
											render={({ field }) => (
												<FormItem>
													<FormLabel>{t("maxRequestsLabel")}</FormLabel>
													<FormControl>
														<Input
															type="number"
															placeholder="100"
															value={field.value?.toString() ?? ""}
															onChange={(e) =>
																field.onChange(
																	e.target.value
																		? Number.parseInt(e.target.value, 10)
																		: null,
																)
															}
														/>
													</FormControl>
													<FormDescription>
														{t("maxRequestsDescription")}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}
							</div>

							<div className="space-y-4 rounded-lg border p-4">
								<h3 className="text-lg font-medium">
									{t("requestLimitingTitle")}
								</h3>
								<FormField
									control={form.control}
									name="remaining"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("totalRequestLimitLabel")}</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={t("totalRequestLimitPlaceholder")}
													value={field.value?.toString() ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number.parseInt(e.target.value, 10)
																: null,
														)
													}
												/>
											</FormControl>
											<FormDescription>
												{t("totalRequestLimitDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="refillAmount"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("refillAmountLabel")}</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={t("refillAmountPlaceholder")}
													value={field.value?.toString() ?? ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number.parseInt(e.target.value, 10)
																: null,
														)
													}
												/>
											</FormControl>
											<FormDescription>
												{t("refillAmountDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="refillInterval"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("refillIntervalLabel")}</FormLabel>
											<Select
												value={field.value?.toString()}
												onValueChange={(value) =>
													field.onChange(Number.parseInt(value, 10))
												}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t("refillIntervalPlaceholder")}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{refillIntervalOptions.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormDescription>
												{t("refillIntervalDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="flex justify-end gap-3 pt-4">
								<Button
									type="button"
									variant="outline"
									onClick={() => setOpen(false)}
								>
									{t("cancel")}
								</Button>
								<Button type="submit">{t("generate")}</Button>
							</div>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			<Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{t("successTitle")}</DialogTitle>
						<DialogDescription>{t("successDescription")}</DialogDescription>
					</DialogHeader>
					<div className="mt-4 space-y-4">
						<CodeEditor
							className="font-mono text-sm break-all"
							language="properties"
							value={newApiKey}
							readOnly
						/>
						<div className="flex justify-end gap-3">
							<Button
								onClick={() => {
									copy(newApiKey);
									toast.success(tToast("apiKeyCopied"));
								}}
							>
								{t("copyToClipboard")}
							</Button>
							<Button
								variant="outline"
								onClick={() => setShowSuccessModal(false)}
							>
								{t("close")}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
};
