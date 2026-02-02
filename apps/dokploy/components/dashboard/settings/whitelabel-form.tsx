"use client";

import { ImageIcon, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { api } from "@/utils/api";

type WhitelabelForm = {
	whitelabelLogoUrl: string | null;
	whitelabelBrandName: string | null;
	whitelabelTagline: string | null;
};

export const WhitelabelForm = () => {
	const { data: settings, refetch, isLoading } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync, isError, error, isLoading: isUpdating } = api.settings.updateWhitelabel.useMutation();
	const { t } = useTranslation("settings");

	const whitelabelSchema = z.object({
		whitelabelLogoUrl: z
			.string()
			.optional()
			.nullable()
			.refine(
				(url) => {
					if (!url || url.trim() === "") return true;
					try {
						const parsedUrl = new URL(url);
						return parsedUrl.protocol === "https:";
					} catch {
						return false;
					}
				},
				(url) => {
					if (!url || url.trim() === "") return true;
					try {
						new URL(url);
						return t("settings.whitelabel.validation.httpsRequired");
					} catch {
						return t("settings.whitelabel.validation.invalidUrl");
					}
				},
			)
			.transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
		whitelabelBrandName: z
			.string()
			.max(100, t("settings.whitelabel.validation.maxLength", { max: 100 }))
			.optional()
			.nullable()
			.transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
		whitelabelTagline: z
			.string()
			.max(200, t("settings.whitelabel.validation.maxLength", { max: 200 }))
			.optional()
			.nullable()
			.transform((val) => (val && val.trim() !== "" ? val.trim() : null)),
	});

	const form = useForm<WhitelabelForm>({
		resolver: zodResolver(whitelabelSchema),
		defaultValues: {
			whitelabelLogoUrl: null,
			whitelabelBrandName: null,
			whitelabelTagline: null,
		},
	});

	useEffect(() => {
		if (settings) {
			form.reset({
				whitelabelLogoUrl: settings.whitelabelLogoUrl || null,
				whitelabelBrandName: settings.whitelabelBrandName || null,
				whitelabelTagline: settings.whitelabelTagline || null,
			});
		}
	}, [settings, form]);

	const onSubmit = async (data: WhitelabelForm) => {
		try {
			await mutateAsync({
				whitelabelLogoUrl: data.whitelabelLogoUrl || null,
				whitelabelBrandName: data.whitelabelBrandName || null,
				whitelabelTagline: data.whitelabelTagline || null,
			});
			toast.success(t("settings.whitelabel.success"));
			await refetch();
		} catch (error) {
			toast.error(t("settings.whitelabel.error"));
		}
	};


	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<ImageIcon className="size-6 text-muted-foreground self-center" />
							{t("settings.whitelabel.title")}
						</CardTitle>
						<CardDescription>
							{t("settings.whitelabel.description")}
						</CardDescription>
					</CardHeader>

					<CardContent className="space-y-2 py-8 border-t">
						{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[35vh]">
								<span>{t("settings.common.loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<Form {...form}>
								<form
									onSubmit={form.handleSubmit(onSubmit)}
									className="space-y-6"
								>
									<FormField
										control={form.control}
										name="whitelabelLogoUrl"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("settings.whitelabel.logoUrl")}
												</FormLabel>
												<FormControl>
													<Input
														placeholder={t("settings.whitelabel.logoUrlPlaceholder")}
														{...field}
														value={field.value || ""}
														maxLength={500}
													/>
												</FormControl>
												<FormDescription>
													{t("settings.whitelabel.logoUrlDescription")}
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="whitelabelBrandName"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("settings.whitelabel.brandName")}
												</FormLabel>
												<FormControl>
													<Input
														placeholder={t("settings.whitelabel.brandNamePlaceholder")}
														{...field}
														value={field.value || ""}
														maxLength={100}
													/>
												</FormControl>
												<FormDescription>
													{t("settings.whitelabel.brandNameDescription")}
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="whitelabelTagline"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("settings.whitelabel.tagline")}
												</FormLabel>
												<FormControl>
													<Input
														placeholder={t("settings.whitelabel.taglinePlaceholder")}
														{...field}
														value={field.value || ""}
														maxLength={200}
													/>
												</FormControl>
												<FormDescription>
													{t("settings.whitelabel.taglineDescription")}
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									<div className="flex justify-end">
										<Button
											type="submit"
											isLoading={isUpdating}
											disabled={isUpdating}
										>
											{t("settings.common.save")}
										</Button>
									</div>
								</form>
							</Form>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
