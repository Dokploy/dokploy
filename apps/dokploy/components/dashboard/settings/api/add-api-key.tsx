import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import { useTranslation } from "next-i18next";
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

const createFormSchema = (t: (key: string) => string) =>
	z.object({
		name: z.string().min(1, t("settings.api.keys.validation.nameRequired")),
		prefix: z.string().optional(),
		expiresIn: z.number().nullable(),
		organizationId: z
			.string()
			.min(1, t("settings.api.keys.validation.organizationRequired")),
		// Rate limiting fields
		rateLimitEnabled: z.boolean().optional(),
		rateLimitTimeWindow: z.number().nullable(),
		rateLimitMax: z.number().nullable(),
		// Request limiting fields
		remaining: z.number().nullable().optional(),
		refillAmount: z.number().nullable().optional(),
		refillInterval: z.number().nullable().optional(),
	});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

const EXPIRATION_OPTIONS = [
	{ labelKey: "settings.api.keys.expiration.never", value: "0" },
	{ labelKey: "settings.api.keys.expiration.1day", value: String(60 * 60 * 24) },
	{ labelKey: "settings.api.keys.expiration.7days", value: String(60 * 60 * 24 * 7) },
	{ labelKey: "settings.api.keys.expiration.30days", value: String(60 * 60 * 24 * 30) },
	{ labelKey: "settings.api.keys.expiration.90days", value: String(60 * 60 * 24 * 90) },
	{ labelKey: "settings.api.keys.expiration.1year", value: String(60 * 60 * 24 * 365) },
];

const TIME_WINDOW_OPTIONS = [
	{ labelKey: "settings.api.keys.timeWindow.1minute", value: String(60 * 1000) },
	{ labelKey: "settings.api.keys.timeWindow.5minutes", value: String(5 * 60 * 1000) },
	{ labelKey: "settings.api.keys.timeWindow.15minutes", value: String(15 * 60 * 1000) },
	{ labelKey: "settings.api.keys.timeWindow.30minutes", value: String(30 * 60 * 1000) },
	{ labelKey: "settings.api.keys.timeWindow.1hour", value: String(60 * 60 * 1000) },
	{ labelKey: "settings.api.keys.timeWindow.1day", value: String(24 * 60 * 60 * 1000) },
];

const REFILL_INTERVAL_OPTIONS = [
	{ labelKey: "settings.api.keys.refillInterval.1hour", value: String(60 * 60 * 1000) },
	{ labelKey: "settings.api.keys.refillInterval.6hours", value: String(6 * 60 * 60 * 1000) },
	{ labelKey: "settings.api.keys.refillInterval.12hours", value: String(12 * 60 * 60 * 1000) },
	{ labelKey: "settings.api.keys.refillInterval.1day", value: String(24 * 60 * 60 * 1000) },
	{ labelKey: "settings.api.keys.refillInterval.7days", value: String(7 * 24 * 60 * 60 * 1000) },
	{ labelKey: "settings.api.keys.refillInterval.30days", value: String(30 * 24 * 60 * 60 * 1000) },
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
			toast.error(t("settings.api.keys.createError"));
		},
	});

	const schema = useMemo(() => createFormSchema(t), [t]);

	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
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
					<Button>{t("settings.api.keys.generateNewKey")}</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-xl max-h-[90vh]">
					<DialogHeader>
						<DialogTitle>{t("settings.api.keys.dialog.title")}</DialogTitle>
						<DialogDescription>
							{t("settings.api.keys.dialog.description")}
						</DialogDescription>
					</DialogHeader>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.api.keys.form.name")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.api.keys.form.namePlaceholder",
												)}
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
										<FormLabel>
											{t("settings.api.keys.form.prefix")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.api.keys.form.prefixPlaceholder",
												)}
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
										<FormLabel>
											{t("settings.api.keys.form.expiration")}
										</FormLabel>
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
															"settings.api.keys.form.expirationPlaceholder",
														)}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{EXPIRATION_OPTIONS.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{t(option.labelKey)}
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
										<FormLabel>
											{t("settings.api.keys.form.organization")}
										</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"settings.api.keys.form.organizationPlaceholder",
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
									{t("settings.api.keys.rateLimit.title")}
								</h3>
								<FormField
									control={form.control}
									name="rateLimitEnabled"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
											<div className="space-y-0.5">
												<FormLabel>
													{t("settings.api.keys.rateLimit.enable.label")}
												</FormLabel>
												<FormDescription>
													{t(
														"settings.api.keys.rateLimit.enable.description",
													)}
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
													<FormLabel>
														{t("settings.api.keys.rateLimit.timeWindow.label")}
													</FormLabel>
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
																		"settings.api.keys.rateLimit.timeWindow.placeholder",
																	)}
																/>
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															{TIME_WINDOW_OPTIONS.map((option) => (
																<SelectItem
																	key={option.value}
																	value={option.value}
																>
																	{t(option.labelKey)}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<FormDescription>
														{t(
															"settings.api.keys.rateLimit.timeWindow.description",
														)}
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
														{t("settings.api.keys.rateLimit.maxRequests.label")}
													</FormLabel>
													<FormControl>
														<Input
															type="number"
															placeholder={t(
																"settings.api.keys.rateLimit.maxRequests.placeholder",
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
														{t(
															"settings.api.keys.rateLimit.maxRequests.description",
														)}
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
									{t("settings.api.keys.requestLimit.title")}
								</h3>
								<FormField
									control={form.control}
									name="remaining"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("settings.api.keys.requestLimit.total.label")}
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={t(
														"settings.api.keys.requestLimit.total.placeholder",
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
												{t(
													"settings.api.keys.requestLimit.total.description",
												)}
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
											<FormLabel>
												{t("settings.api.keys.requestLimit.refillAmount.label")}
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={t(
														"settings.api.keys.requestLimit.refillAmount.placeholder",
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
												{t(
													"settings.api.keys.requestLimit.refillAmount.description",
												)}
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
											<FormLabel>
												{t("settings.api.keys.requestLimit.refillInterval.label")}
											</FormLabel>
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
																"settings.api.keys.requestLimit.refillInterval.placeholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{REFILL_INTERVAL_OPTIONS.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{t(option.labelKey)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormDescription>
												{t(
													"settings.api.keys.requestLimit.refillInterval.description",
												)}
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
									{t("settings.api.keys.dialog.cancel")}
								</Button>
								<Button type="submit">
									{t("settings.api.keys.dialog.generate")}
								</Button>
							</div>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			<Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>
							{t("settings.api.keys.success.title")}
						</DialogTitle>
						<DialogDescription>
							{t("settings.api.keys.success.description")}
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
									toast.success(t("settings.api.keys.success.copyToast"));
								}}
							>
								{t("settings.api.keys.success.copyButton")}
							</Button>
							<Button
								variant="outline"
								onClick={() => setShowSuccessModal(false)}
							>
								{t("settings.api.keys.success.closeButton")}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
};
