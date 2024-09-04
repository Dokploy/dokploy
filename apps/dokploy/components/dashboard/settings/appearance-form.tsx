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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { storefronts } from "@/i18n/storefronts";
import { useTheme } from "next-themes";
import { useRouter } from "next/router";
import { Fragment, useEffect } from "react";
import { toast } from "sonner";

const appearanceFormSchema = z.object({
	theme: z.enum(["light", "dark", "system"], {
		required_error: "Please select a theme.",
	}),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

// This can come from your database or API.
const defaultValues: Partial<AppearanceFormValues> = {
	theme: "system",
};

export function AppearanceForm() {
	const { setTheme, theme } = useTheme();
	const form = useForm<AppearanceFormValues>({
		resolver: zodResolver(appearanceFormSchema),
		defaultValues,
	});
	const { query, pathname } = useRouter();
	const locale = query?.locale as string;

	useEffect(() => {
		form.reset({
			theme: (theme ?? "system") as AppearanceFormValues["theme"],
		});
	}, [form, theme]);
	function onSubmit(data: AppearanceFormValues) {
		setTheme(data.theme);
		toast.success("Preferences Updated");
	}

	function onLocaleSwitch(geo: string) {
		document.cookie = `geo=${geo}; path=/;`;
		const path = pathname?.replace("[locale]", geo)

		window.location.replace(path);
	}

	return (
		<Fragment>
			<Card className="bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">Appearance</CardTitle>
					<CardDescription>
						Customize the theme of your dashboard.
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
											<FormLabel>Theme</FormLabel>
											<FormDescription>
												Select a theme for your dashboard
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
															Light
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
															Dark
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
															System
														</span>
													</FormLabel>
												</FormItem>
											</RadioGroup>
										</FormItem>
									);
								}}
							/>

							<Button type="submit">Save</Button>
						</form>
					</Form>
				</CardContent>
			</Card>
			<Card className="bg-transparent">
				<CardHeader>
					<CardTitle className="text-xl">国际化</CardTitle>
					<CardDescription>
						选择本地化
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<div className="space-y-8">
						<div className="space-y-1 ">
							<label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">语言</label>
							<p className="text-sm text-muted-foreground">选择语言</p>
							<Select
								value={locale}
								onValueChange={(geo) => {
									onLocaleSwitch(geo)
								}}>
								<SelectTrigger>
									<SelectValue placeholder="选择语言" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectLabel>
											选择语言
										</SelectLabel>
										{storefronts.map((item) => (
											<SelectItem
												key={item.id}
												value={item.id}
											>{item.label}</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardContent>
			</Card>
		</Fragment>
	);
}
