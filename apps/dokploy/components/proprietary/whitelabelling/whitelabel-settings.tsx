"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Palette } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
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
	whitelabelAppName: z.string().min(1).max(100),
	whitelabelLogoUrl: z.union([z.string().url(), z.literal("")]).optional(),
	whitelabelLoginLogoUrl: z.union([z.string().url(), z.literal("")]).optional(),
	whitelabelFaviconUrl: z.union([z.string().url(), z.literal("")]).optional(),
	whitelabelLoginTitle: z.string().max(200).optional(),
	whitelabelLoginSubtitle: z.string().max(500).optional(),
	whitelabelLoginBackgroundImageUrl: z
		.union([z.string().url(), z.literal("")])
		.optional(),
});

type WhitelabelFormValues = z.infer<typeof whitelabelSchema>;

export function WhitelabelSettings() {
	const { data: settings, isLoading } =
		api.settings.getWebServerSettings.useQuery();
	const { mutateAsync: updateWhitelabel, isLoading: isSaving } =
		api.settings.updateWhitelabelSettings.useMutation();
	const utils = api.useUtils();

	const form = useForm<WhitelabelFormValues>({
		resolver: zodResolver(whitelabelSchema),
		defaultValues: {
			whitelabelAppName: "Dokploy",
			whitelabelLogoUrl: "",
			whitelabelLoginLogoUrl: "",
			whitelabelFaviconUrl: "",
			whitelabelLoginTitle: "",
			whitelabelLoginSubtitle: "",
			whitelabelLoginBackgroundImageUrl: "",
		},
	});

	useEffect(() => {
		if (settings) {
			form.reset({
				whitelabelAppName: settings.whitelabelAppName ?? "Dokploy",
				whitelabelLogoUrl: settings.whitelabelLogoUrl ?? "",
				whitelabelLoginLogoUrl: settings.whitelabelLoginLogoUrl ?? "",
				whitelabelFaviconUrl: settings.whitelabelFaviconUrl ?? "",
				whitelabelLoginTitle: settings.whitelabelLoginTitle ?? "",
				whitelabelLoginSubtitle: settings.whitelabelLoginSubtitle ?? "",
				whitelabelLoginBackgroundImageUrl:
					settings.whitelabelLoginBackgroundImageUrl ?? "",
			});
		}
	}, [settings, form]);

	const onSubmit = async (values: WhitelabelFormValues) => {
		try {
			await updateWhitelabel({
				whitelabelAppName: values.whitelabelAppName || null,
				whitelabelLogoUrl: values.whitelabelLogoUrl || undefined,
				whitelabelLoginLogoUrl: values.whitelabelLoginLogoUrl || undefined,
				whitelabelFaviconUrl: values.whitelabelFaviconUrl || undefined,
				whitelabelLoginTitle: values.whitelabelLoginTitle || null,
				whitelabelLoginSubtitle: values.whitelabelLoginSubtitle || null,
				whitelabelLoginBackgroundImageUrl:
					values.whitelabelLoginBackgroundImageUrl || undefined,
			});
			toast.success("Whitelabel settings saved");
			utils.settings.getWebServerSettings.invalidate();
			utils.settings.getWhitelabelSettings.invalidate();
		} catch (e) {
			toast.error("Failed to save whitelabel settings");
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 justify-center min-h-[25vh]">
				<Loader2 className="size-6 text-muted-foreground animate-spin" />
				<span className="text-sm text-muted-foreground">
					Loading whitelabel settings...
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 rounded-lg ">
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<Palette className="size-6 text-muted-foreground" />
					<CardTitle className="text-xl">Whitelabeling</CardTitle>
				</div>
				<CardDescription>
					Customize the application name, logos, and login page for your brand.
					Leave URLs empty to use defaults.
				</CardDescription>
			</div>

			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex flex-col gap-6"
				>
					<div className="space-y-4 pt-2 border-t">
						<div>
							<h3 className="text-sm font-medium">Brand</h3>
							<p className="text-sm text-muted-foreground">
								Application name and main logo (sidebar, header).
							</p>
						</div>
						<FormField
							control={form.control}
							name="whitelabelAppName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Application name</FormLabel>
									<FormControl>
										<Input
											placeholder="Dokploy"
											{...field}
											className="max-w-md"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="whitelabelLogoUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Logo URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://example.com/logo.png"
											{...field}
											value={field.value ?? ""}
											className="max-w-md"
										/>
									</FormControl>
									<FormDescription>
										Logo shown in the sidebar and header.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="whitelabelFaviconUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Favicon URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://example.com/favicon.ico"
											{...field}
											value={field.value ?? ""}
											className="max-w-md"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<div className="space-y-4 pt-6 border-t">
						<div>
							<h3 className="text-sm font-medium">Login page</h3>
							<p className="text-sm text-muted-foreground">
								Customize the sign-in and registration screens.
							</p>
						</div>
						<FormField
							control={form.control}
							name="whitelabelLoginLogoUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Login logo URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://example.com/login-logo.png"
											{...field}
											value={field.value ?? ""}
											className="max-w-md"
										/>
									</FormControl>
									<FormDescription>
										Logo on the login and register pages. Falls back to the main
										logo if empty.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="whitelabelLoginTitle"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Login title</FormLabel>
									<FormControl>
										<Input
											placeholder="Sign in"
											{...field}
											value={field.value ?? ""}
											className="max-w-md"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="whitelabelLoginSubtitle"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Login subtitle</FormLabel>
									<FormControl>
										<Input
											placeholder="Enter your email and password to sign in"
											{...field}
											value={field.value ?? ""}
											className="max-w-md"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="whitelabelLoginBackgroundImageUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Login background image URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://example.com/background.jpg"
											{...field}
											value={field.value ?? ""}
											className="max-w-md"
										/>
									</FormControl>
									<FormDescription>
										Optional background image for the login page.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<div className="flex justify-end pt-4 border-t">
						<Button type="submit" disabled={isSaving}>
							{isSaving ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" />
									Saving...
								</>
							) : (
								"Save changes"
							)}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
}
