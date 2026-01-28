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

const whitelabelSchema = z.object({
	whitelabelLogoUrl: z.string().url("Geçerli bir URL girin").optional().nullable(),
	whitelabelBrandName: z.string().optional().nullable(),
	whitelabelTagline: z.string().optional().nullable(),
});

type WhitelabelForm = z.infer<typeof whitelabelSchema>;

export const WhitelabelForm = () => {
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: settings, refetch, isLoading } = api.settings.getWebServerSettings.useQuery(undefined, {
		enabled: !isCloud,
	});
	const { mutateAsync, isError, error, isLoading: isUpdating } = api.settings.updateWhitelabel.useMutation();
	const { t } = useTranslation("settings");

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

	if (isCloud) {
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
							<AlertBlock type="info">
								Whitelabel özelliği sadece self-hosted kurulumlarda kullanılabilir.
							</AlertBlock>
						</CardContent>
					</div>
				</Card>
			</div>
		);
	}

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
														placeholder="https://example.com/logo.png"
														{...field}
														value={field.value || ""}
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
														placeholder="Şirket Adı"
														{...field}
														value={field.value || ""}
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
														placeholder="Sloganınız"
														{...field}
														value={field.value || ""}
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
