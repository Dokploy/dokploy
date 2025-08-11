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
import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import { type TFunction, useTranslation } from "next-i18next";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const formSchema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, t("settings.api.nameRequired")),
		prefix: z.string().optional(),
		expiresIn: z.number().nullable(),
		organizationId: z.string().min(1, t("settings.api.organizationRequired")),
		// Rate limiting fields
		rateLimitEnabled: z.boolean().optional(),
		rateLimitTimeWindow: z.number().nullable(),
		rateLimitMax: z.number().nullable(),
		// Request limiting fields
		remaining: z.number().nullable().optional(),
		refillAmount: z.number().nullable().optional(),
		refillInterval: z.number().nullable().optional(),
	});

type FormValues = z.infer<ReturnType<typeof formSchema>>;

const EXPIRATION_OPTIONS = (t: TFunction) => [
	{ label: t("settings.api.never"), value: "0" },
	{ label: t("settings.api.1Day"), value: String(60 * 60 * 24) },
	{ label: t("settings.api.7Days"), value: String(60 * 60 * 24 * 7) },
	{ label: t("settings.api.30Days"), value: String(60 * 60 * 24 * 30) },
	{ label: t("settings.api.90Days"), value: String(60 * 60 * 24 * 90) },
	{ label: t("settings.api.1Year"), value: String(60 * 60 * 24 * 365) },
];

const TIME_WINDOW_OPTIONS = (t: TFunction) => [
	{ label: t("settings.api.1Minute"), value: String(60 * 1000) },
	{ label: t("settings.api.5Minutes"), value: String(5 * 60 * 1000) },
	{ label: t("settings.api.15Minutes"), value: String(15 * 60 * 1000) },
	{ label: t("settings.api.30Minutes"), value: String(30 * 60 * 1000) },
	{ label: t("settings.api.1Hour"), value: String(60 * 60 * 1000) },
	{ label: t("settings.api.1Day"), value: String(24 * 60 * 60 * 1000) },
];

const REFILL_INTERVAL_OPTIONS = (t: TFunction) => [
	{ label: t("settings.api.1Hour"), value: String(60 * 60 * 1000) },
	{ label: t("settings.api.6Hours"), value: String(6 * 60 * 60 * 1000) },
	{ label: t("settings.api.12Hours"), value: String(12 * 60 * 60 * 1000) },
	{ label: t("settings.api.1Day"), value: String(24 * 60 * 60 * 1000) },
	{ label: t("settings.api.7Days"), value: String(7 * 24 * 60 * 60 * 1000) },
	{ label: t("settings.api.30Days"), value: String(30 * 24 * 60 * 60 * 1000) },
];

export const AddApiKey = () => {
	const { t } = useTranslation("settings");
	const [open, setOpen] = useState(false);
	const [showSuccessModal, setShowSuccessModal] = useState(false);
	const [newApiKey, setNewApiKey] = useState("");
	const { refetch } = api.user.get.useQuery();
	const { data: organizations } = api.organization.all.useQuery();
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
			toast.error(t("settings.api.failedToGenerate"));
		},
	});

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema(t)),
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

	const rateLimitEnabled = form.watch("rateLimitEnabled");

	const onSubmit = async (values: FormValues) => {
		createApiKey.mutate({
			name: values.name,
			expiresIn: values.expiresIn || undefined,
			prefix: values.prefix || undefined,
			metadata: {
				organizationId: values.organizationId,
			},
			// Rate limiting
			rateLimitEnabled: values.rateLimitEnabled,
			rateLimitTimeWindow: values.rateLimitTimeWindow || undefined,
			rateLimitMax: values.rateLimitMax || undefined,
			// Request limiting
			remaining: values.remaining || undefined,
			refillAmount: values.refillAmount || undefined,
			refillInterval: values.refillInterval || undefined,
		});
	};

	return (
		<>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button>{t("settings.api.generateNewKey")}</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-xl max-h-[90vh]">
					<DialogHeader>
						<DialogTitle>{t("settings.api.generateApiKey")}</DialogTitle>
						<DialogDescription>
							{t("settings.api.generateApiKeyDescription")}
						</DialogDescription>
					</DialogHeader>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.api.name")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("settings.api.namePlaceholder")}
												{...field}
											/>
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
										<FormLabel>{t("settings.api.prefix")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("settings.api.prefixPlaceholder")}
												{...field}
											/>
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
										<FormLabel>{t("settings.api.expiration")}</FormLabel>
										<Select
											value={field.value?.toString() || "0"}
											onValueChange={(value) =>
												field.onChange(Number.parseInt(value, 10))
											}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"settings.api.expirationPlaceholder",
														)}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{EXPIRATION_OPTIONS(t).map((option) => (
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
										<FormLabel>{t("settings.api.organization")}</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"settings.api.organizationPlaceholder",
														)}
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

							{/* Rate Limiting Section */}
							<div className="space-y-4 rounded-lg border p-4">
								<h3 className="text-lg font-medium">
									{t("settings.api.rateLimiting")}
								</h3>
								<FormField
									control={form.control}
									name="rateLimitEnabled"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
											<div className="space-y-0.5">
												<FormLabel>
													{t("settings.api.enableRateLimiting")}
												</FormLabel>
												<FormDescription>
													{t("settings.api.enableRateLimitingDescription")}
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
													<FormLabel>{t("settings.api.timeWindow")}</FormLabel>
													<Select
														value={field.value?.toString()}
														onValueChange={(value) =>
															field.onChange(Number.parseInt(value, 10))
														}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue
																	placeholder={t(
																		"settings.api.timeWindowPlaceholder",
																	)}
																/>
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{TIME_WINDOW_OPTIONS(t).map((option) => (
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
														{t("settings.api.timeWindowDescription")}
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
													<FormLabel>
														{t("settings.api.maximumRequests")}
													</FormLabel>
													<FormControl>
														<Input
															type="number"
															placeholder={t(
																"settings.api.maximumRequestsPlaceholder",
															)}
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
														{t("settings.api.maximumRequestsDescription")}
													</FormDescription>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}
							</div>

							{/* Request Limiting Section */}
							<div className="space-y-4 rounded-lg border p-4">
								<h3 className="text-lg font-medium">
									{t("settings.api.requestLimiting")}
								</h3>
								<FormField
									control={form.control}
									name="remaining"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.api.totalRequestLimit")}
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={t(
														"settings.api.totalRequestLimitPlaceholder",
													)}
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
												{t("settings.api.totalRequestLimitDescription")}
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
											<FormLabel>{t("settings.api.refillAmount")}</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={t(
														"settings.api.refillAmountPlaceholder",
													)}
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
												{t("settings.api.refillAmountDescription")}
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
											<FormLabel>{t("settings.api.refillInterval")}</FormLabel>
											<Select
												value={field.value?.toString()}
												onValueChange={(value) =>
													field.onChange(Number.parseInt(value, 10))
												}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"settings.api.refillIntervalPlaceholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{REFILL_INTERVAL_OPTIONS(t).map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormDescription>
												{t("settings.api.refillIntervalDescription")}
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
									{t("settings.api.cancel")}
								</Button>
								<Button type="submit">{t("settings.api.generate")}</Button>
							</div>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			<Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{t("settings.api.generatedSuccessfully")}</DialogTitle>
						<DialogDescription>
							{t("settings.api.generatedSuccessfullyDescription")}
						</DialogDescription>
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
									toast.success(t("settings.api.copiedToClipboard"));
								}}
							>
								{t("settings.api.copyToClipboard")}
							</Button>
							<Button
								variant="outline"
								onClick={() => setShowSuccessModal(false)}
							>
								{t("settings.api.close")}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
};
