import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Languages } from "@/lib/languages";
import useLocale from "@/utils/hooks/use-locale";
import { useTranslation } from "next-i18next";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { toast } from "sonner";


const languageCodes = Object.values(Languages).map(lang => lang.code) as [string, ...string[]]; 

const appearanceFormSchema = z.object({
	theme: z.enum(["light", "dark", "system"], {
		required_error: "Please select a theme.",
	}),

	language: z.enum(languageCodes, {
		required_error: "Please select a language.",
	})
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

// This can come from your database or API.
const defaultValues: Partial<AppearanceFormValues> = {
	theme: "system",
	language: Languages.english.code,
};

export function AppearanceForm() {
	const { setTheme, theme } = useTheme();
	const { locale, setLocale } = useLocale();
	const { t } = useTranslation("settings");

	const form = useForm<AppearanceFormValues>({
		resolver: zodResolver(appearanceFormSchema),
		defaultValues,
	});

	useEffect(() => {
		form.reset({
			theme: (theme ?? "system") as AppearanceFormValues["theme"],
			language: locale,
		});
	}, [form, theme, locale]);
	function onSubmit(data: AppearanceFormValues) {
		setTheme(data.theme);
		setLocale(data.language);
		toast.success("Preferences Updated");
	}

	return (
		<Card className="bg-transparent">
			<CardHeader>
				<CardTitle className="text-xl">
					{t("settings.appearance.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.appearance.description")}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
						<FormField
							control={form.control}
							name="theme"
							defaultValue={form.control._defaultValues.theme}
							render={({ field }) => {
								return (
									<FormItem className="space-y-1 ">
										<FormLabel>{t("settings.appearance.theme")}</FormLabel>
										<FormDescription>
											{t("settings.appearance.themeDescription")}
										</FormDescription>
										<FormMessage />
										<RadioGroup
											onValueChange={field.onChange}
											defaultValue={field.value}
											value={field.value}
											className="grid max-w-md md:max-w-lg grid-cols-1 sm:grid-cols-3 gap-8 pt-2"
										>
											<FormItem>
												<FormLabel className="[&:has([data-state=checked])>div]:border-primary">
													<FormControl>
														<RadioGroupItem value="light" className="sr-only" />
													</FormControl>
													<div className="items-center rounded-md border-2 border-muted p-1 hover:bg-accent transition-colors cursor-pointer">
														<img src="/images/theme-light.svg" alt="light" />
													</div>
													<span className="block w-full p-2 text-center font-normal">
														{t("settings.appearance.themes.light")}
													</span>
												</FormLabel>
											</FormItem>
											<FormItem>
												<FormLabel className="[&:has([data-state=checked])>div]:border-primary">
													<FormControl>
														<RadioGroupItem value="dark" className="sr-only" />
													</FormControl>
													<div className="items-center rounded-md border-2 border-muted bg-popover p-1 transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer">
														<img src="/images/theme-dark.svg" alt="dark" />
													</div>
													<span className="block w-full p-2 text-center font-normal">
														{t("settings.appearance.themes.dark")}
													</span>
												</FormLabel>
											</FormItem>
											<FormItem>
												<FormLabel className="[&:has([data-state=checked])>div]:border-primary">
													<FormControl>
														<RadioGroupItem
															value="system"
															className="sr-only"
														/>
													</FormControl>
													<div className="items-center rounded-md border-2 border-muted bg-popover p-1 transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer">
														<img src="/images/theme-system.svg" alt="system" />
													</div>
													<span className="block w-full p-2 text-center font-normal">
														{t("settings.appearance.themes.system")}
													</span>
												</FormLabel>
											</FormItem>
										</RadioGroup>
									</FormItem>
								);
							}}
						/>

						<FormField
							control={form.control}
							name="language"
							defaultValue={form.control._defaultValues.language}
							render={({ field }) => {
								return (
									<FormItem className="space-y-1">
										<FormLabel>{t("settings.appearance.language")}</FormLabel>
										<FormDescription>
											{t("settings.appearance.languageDescription")}
										</FormDescription>
										<FormMessage />
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
											value={field.value}
										>
											<SelectTrigger>
												<SelectValue placeholder="No preset selected" />
											</SelectTrigger>
											<SelectContent>
											{Object.values(Languages).map((language) => (
												<SelectItem key={language.code} value={language.code}>
													{language.name}
												</SelectItem>
											))}
											</SelectContent>
										</Select>
									</FormItem>
								);
							}}
						/>

						<Button type="submit">{t("settings.common.save")}</Button>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}
