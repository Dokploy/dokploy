import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

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
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const appearanceFormSchema = z.object({
	theme: z.enum(["light", "dark"], {
		required_error: "Please select a theme.",
	}),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

// This can come from your database or API.
const defaultValues: Partial<AppearanceFormValues> = {
	theme: "light",
};

export function AppearanceForm() {
	const { setTheme, theme } = useTheme();
	const form = useForm<AppearanceFormValues>({
		resolver: zodResolver(appearanceFormSchema),
		defaultValues,
	});

	useEffect(() => {
		form.reset({
			theme: theme === "light" ? "light" : "dark",
		});
	}, [form, theme]);
	function onSubmit(data: AppearanceFormValues) {
		setTheme(data.theme);
		toast.success("Preferences Updated");
	}

	return (
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
											className="grid max-w-md grid-cols-1 sm:grid-cols-2 gap-8 pt-2"
										>
											<FormItem>
												<FormLabel className="[&:has([data-state=checked])>div]:border-primary">
													<FormControl>
														<RadioGroupItem value="light" className="sr-only" />
													</FormControl>
													<div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent">
														<div className="space-y-2 rounded-sm bg-[#ecedef] p-2">
															<div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
																<div className="h-2 w-[80px] rounded-lg bg-[#ecedef]" />
																<div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
															</div>
															<div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
																<div className="h-4 w-4 rounded-full bg-[#ecedef]" />
																<div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
															</div>
															<div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
																<div className="h-4 w-4 rounded-full bg-[#ecedef]" />
																<div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
															</div>
														</div>
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
													<div className="items-center rounded-md border-2 border-muted bg-popover p-1 hover:bg-accent hover:text-accent-foreground">
														<div className="space-y-2 rounded-sm bg-slate-950 p-2">
															<div className="space-y-2 rounded-md bg-slate-800 p-2 shadow-sm">
																<div className="h-2 w-[80px] rounded-lg bg-slate-400" />
																<div className="h-2 w-[100px] rounded-lg bg-slate-400" />
															</div>
															<div className="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm">
																<div className="h-4 w-4 rounded-full bg-slate-400" />
																<div className="h-2 w-[100px] rounded-lg bg-slate-400" />
															</div>
															<div className="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm">
																<div className="h-4 w-4 rounded-full bg-slate-400" />
																<div className="h-2 w-[100px] rounded-lg bg-slate-400" />
															</div>
														</div>
													</div>
													<span className="block w-full p-2 text-center font-normal">
														Dark
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
	);
}
