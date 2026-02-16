"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ImagePlus, Loader2, Palette, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CodeEditor } from "@/components/shared/code-editor";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const formSchema = z.object({
	appName: z.string().max(256).optional().or(z.literal("")),
	tagline: z.string().max(512).optional().or(z.literal("")),
	logoUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine(
			(v) =>
				!v || v.startsWith("data:") || z.string().url().safeParse(v).success,
			"Must be a valid URL or uploaded image",
		),
	faviconUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine(
			(v) =>
				!v || v.startsWith("data:") || z.string().url().safeParse(v).success,
			"Must be a valid URL or uploaded image",
		),
	customCss: z.string().max(8192).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_FAVICON_SIZE_BYTES = 512 * 1024; // 512KB (favicons are small)

/** Reference of CSS variables used by the app (from globals.css). Use in :root for light, .dark for dark mode. Values: HSL without hsl() e.g. 220 70% 50% */
const CSS_VARIABLES_REFERENCE = `/* General */
--background, --foreground
--card, --card-foreground
--popover, --popover-foreground
--primary, --primary-foreground
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--destructive, --destructive-foreground
--border, --input, --ring
--radius (e.g. 0.5rem)
--overlay (e.g. rgba(0,0,0,0.2))

/* Sidebar */
--sidebar-background, --sidebar-foreground
--sidebar-primary, --sidebar-primary-foreground
--sidebar-accent, --sidebar-accent-foreground
--sidebar-border, --sidebar-ring

/* Charts */
--chart-1, --chart-2, --chart-3, --chart-4, --chart-5`;

/** Default theme CSS (mirrors globals.css). Load into editor so user can edit variables without writing from scratch. */
const DEFAULT_THEME_CSS = `:root {
	--terminal-paste: rgba(0, 0, 0, 0.2);
	--background: 0 0% 100%;
	--foreground: 240 10% 3.9%;
	--card: 0 0% 100%;
	--card-foreground: 240 10% 3.9%;
	--popover: 0 0% 100%;
	--popover-foreground: 240 10% 3.9%;
	--primary: 240 5.9% 10%;
	--primary-foreground: 0 0% 98%;
	--secondary: 240 4.8% 95.9%;
	--secondary-foreground: 240 5.9% 10%;
	--muted: 240 4.8% 95.9%;
	--muted-foreground: 240 3.8% 46.1%;
	--accent: 240 4.8% 95.9%;
	--accent-foreground: 240 5.9% 10%;
	--destructive: 0 84.2% 50.2%;
	--destructive-foreground: 0 0% 98%;
	--border: 240 5.9% 90%;
	--input: 240 5.9% 90%;
	--ring: 240 10% 3.9%;
	--radius: 0.5rem;
	--overlay: rgba(0, 0, 0, 0.2);
	--chart-1: 173 58% 39%;
	--chart-2: 12 76% 61%;
	--chart-3: 197 37% 24%;
	--chart-4: 43 74% 66%;
	--chart-5: 27 87% 67%;
	--sidebar-background: 0 0% 98%;
	--sidebar-foreground: 240 5.3% 26.1%;
	--sidebar-primary: 240 5.9% 10%;
	--sidebar-primary-foreground: 0 0% 98%;
	--sidebar-accent: 240 4.8% 95.9%;
	--sidebar-accent-foreground: 240 5.9% 10%;
	--sidebar-border: 220 13% 91%;
	--sidebar-ring: 217.2 91.2% 59.8%;
}

.dark {
	--terminal-paste: rgba(255, 255, 255, 0.2);
	--background: 0 0% 0%;
	--foreground: 0 0% 98%;
	--card: 240 4% 10%;
	--card-foreground: 0 0% 98%;
	--popover: 240 10% 3.9%;
	--popover-foreground: 0 0% 98%;
	--primary: 0 0% 98%;
	--primary-foreground: 240 5.9% 10%;
	--secondary: 240 3.7% 15.9%;
	--secondary-foreground: 0 0% 98%;
	--muted: 240 4% 10%;
	--muted-foreground: 240 5% 64.9%;
	--accent: 240 3.7% 15.9%;
	--accent-foreground: 0 0% 98%;
	--destructive: 0 84.2% 50.2%;
	--destructive-foreground: 0 0% 98%;
	--border: 240 3.7% 15.9%;
	--input: 240 4% 10%;
	--ring: 240 4.9% 83.9%;
	--overlay: rgba(0, 0, 0, 0.5);
	--chart-1: 220 70% 50%;
	--chart-2: 340 75% 55%;
	--chart-3: 30 80% 55%;
	--chart-4: 280 65% 60%;
	--chart-5: 160 60% 45%;
	--sidebar-background: 240 5.9% 10%;
	--sidebar-foreground: 240 4.8% 95.9%;
	--sidebar-primary: 224.3 76.3% 48%;
	--sidebar-primary-foreground: 0 0% 100%;
	--sidebar-accent: 240 3.7% 15.9%;
	--sidebar-accent-foreground: 240 4.8% 95.9%;
	--sidebar-border: 240 3.7% 15.9%;
	--sidebar-ring: 217.2 91.2% 59.8%;
}
`;

export const WhitelabelForm = () => {
	const logoFileInputRef = useRef<HTMLInputElement>(null);
	const faviconFileInputRef = useRef<HTMLInputElement>(null);
	const { data, isLoading } = api.whitelabel.get.useQuery();
	const utils = api.useUtils();
	const { mutateAsync, isLoading: isPending } =
		api.whitelabel.update.useMutation();

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			appName: "",
			tagline: "",
			logoUrl: "",
			faviconUrl: "",
			customCss: "",
		},
	});

	useEffect(() => {
		if (data) {
			form.reset({
				appName: data.appName ?? "",
				tagline: data.tagline ?? "",
				logoUrl: data.logoUrl ?? "",
				faviconUrl: data.faviconUrl ?? "",
				customCss: data.customCss ?? "",
			});
		}
	}, [data, form]);

	const onSubmit = async (values: FormValues) => {
		await mutateAsync({
			appName: values.appName?.trim() || null,
			tagline: values.tagline?.trim() || null,
			logoUrl: values.logoUrl?.trim() || null,
			faviconUrl: values.faviconUrl?.trim() || null,
			customCss: values.customCss?.trim() || null,
		})
			.then(() => {
				utils.whitelabel.get.invalidate();
				toast.success("Whitelabel settings saved");
			})
			.catch((error) => {
				toast.error(error.message ?? "Failed to save");
			});
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border p-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Palette className="size-6 text-muted-foreground" />
						<CardTitle className="text-xl">Whitelabelling</CardTitle>
					</div>
					<CardDescription>
						Customize the app name and logos for your self-hosted instance.
						These will appear on the login page, sidebar, and browser tab.
					</CardDescription>
				</div>
			</div>

			{isLoading ? (
				<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
					<span>Loading...</span>
					<Loader2 className="animate-spin size-4" />
				</div>
			) : (
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<FormField
							control={form.control}
							name="appName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>App name</FormLabel>
									<FormControl>
										<Input placeholder="e.g. My Company DevOps" {...field} />
									</FormControl>
									<FormDescription>
										Replaces &quot;Dokploy&quot; in the UI when set.
									</FormDescription>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="tagline"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Tagline</FormLabel>
									<FormControl>
										<Input
											placeholder="e.g. The Open Source alternative to Netlify, Vercel, Heroku."
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Quote shown on the login/onboarding side panel. Leave empty
										for default.
									</FormDescription>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="logoUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Logo</FormLabel>
									<FormControl>
										<>
											{field.value?.startsWith("data:") ? (
												<div className="flex flex-col gap-2">
													<div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
														<Logo
															className="size-12 shrink-0"
															logoUrl={field.value}
														/>
														<div className="flex-1 min-w-0">
															<p className="text-sm font-medium">
																Uploaded image
															</p>
															<p className="text-xs text-muted-foreground">
																Image is stored and will appear in sidebar and
																login.
															</p>
														</div>
														<div className="flex gap-2 shrink-0">
															<Button
																type="button"
																variant="outline"
																size="sm"
																onClick={() =>
																	logoFileInputRef.current?.click()
																}
															>
																<ImagePlus className="mr-1 size-4" />
																Replace
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																onClick={() => field.onChange("")}
															>
																<X className="mr-1 size-4" />
																Use URL instead
															</Button>
														</div>
													</div>
												</div>
											) : (
												<div className="flex gap-2">
													<Input
														placeholder="https://example.com/logo.png"
														{...field}
														className="flex-1"
													/>
													<Button
														type="button"
														variant="outline"
														onClick={() => logoFileInputRef.current?.click()}
													>
														<ImagePlus className="mr-2 size-4" />
														Upload image
													</Button>
												</div>
											)}
											<input
												ref={logoFileInputRef}
												type="file"
												accept="image/*"
												className="hidden"
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) {
														if (file.size > MAX_LOGO_SIZE_BYTES) {
															toast.error("Image size must be less than 2MB");
															return;
														}
														const reader = new FileReader();
														reader.onload = (event) => {
															const result = event.target?.result as string;
															field.onChange(result);
														};
														reader.readAsDataURL(file);
													}
													e.target.value = "";
												}}
											/>
										</>
									</FormControl>
									<FormDescription>
										Paste a logo URL or upload an image (max 2MB). Used in
										sidebar and login.
									</FormDescription>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="faviconUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Favicon</FormLabel>
									<FormControl>
										<>
											{field.value?.startsWith("data:") ? (
												<div className="flex flex-col gap-2">
													<div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
														{field.value && (
															// biome-ignore lint/performance/noImgElement: favicon preview from data URL
															<img
																src={field.value}
																alt="Favicon"
																className="size-8 shrink-0 object-contain"
															/>
														)}
														<div className="flex-1 min-w-0">
															<p className="text-sm font-medium">
																Uploaded favicon
															</p>
															<p className="text-xs text-muted-foreground">
																Shown in the browser tab.
															</p>
														</div>
														<div className="flex gap-2 shrink-0">
															<Button
																type="button"
																variant="outline"
																size="sm"
																onClick={() =>
																	faviconFileInputRef.current?.click()
																}
															>
																<ImagePlus className="mr-1 size-4" />
																Replace
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																onClick={() => field.onChange("")}
															>
																<X className="mr-1 size-4" />
																Use URL instead
															</Button>
														</div>
													</div>
												</div>
											) : (
												<div className="flex gap-2">
													<Input
														placeholder="https://example.com/favicon.ico"
														{...field}
														className="flex-1"
													/>
													<Button
														type="button"
														variant="outline"
														onClick={() => faviconFileInputRef.current?.click()}
													>
														<ImagePlus className="mr-2 size-4" />
														Upload image
													</Button>
												</div>
											)}
											<input
												ref={faviconFileInputRef}
												type="file"
												accept="image/*"
												className="hidden"
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) {
														if (file.size > MAX_FAVICON_SIZE_BYTES) {
															toast.error(
																"Favicon size must be less than 512KB",
															);
															return;
														}
														const reader = new FileReader();
														reader.onload = (event) => {
															const result = event.target?.result as string;
															field.onChange(result);
														};
														reader.readAsDataURL(file);
													}
													e.target.value = "";
												}}
											/>
										</>
									</FormControl>
									<FormDescription>
										Paste a favicon URL or upload an image (max 512KB). Shown in
										the browser tab.
									</FormDescription>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="customCss"
							render={({ field }) => (
								<FormItem>
									<div className="flex items-center justify-between gap-2">
										<FormLabel>Custom CSS</FormLabel>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => {
												form.setValue("customCss", DEFAULT_THEME_CSS, {
													shouldDirty: true,
												});
												toast.success("Default theme loaded. Edit and save.");
											}}
										>
											Load default theme
										</Button>
									</div>
									<FormControl>
										<CodeEditor
											language="css"
											lineWrapping
											lineNumbers={false}
											wrapperClassName="min-h-[180px] rounded-md border"
											placeholder={`:root {
  --primary: 220 70% 50%;
  --primary-foreground: 0 0% 100%;
}
.dark {
  --primary: 220 70% 50%;
}`}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Optional. Override theme colors using CSS variables. Use{" "}
										<code className="rounded bg-muted px-1">:root</code> for
										light mode and{" "}
										<code className="rounded bg-muted px-1">.dark</code> for
										dark mode. Values in HSL without &quot;hsl()&quot;.
										Don&apos;t use quotes around colors (e.g.{" "}
										<code className="rounded bg-muted px-1">red</code>, not
										&quot;red&quot;). Max 8KB.
									</FormDescription>
									<Collapsible className="mt-2 group">
										<CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
											<ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
											Available CSS variables
										</CollapsibleTrigger>
										<CollapsibleContent>
											<pre className="mt-2 rounded-md border bg-muted p-3 text-xs font-mono overflow-x-auto whitespace-pre text-muted-foreground">
												{CSS_VARIABLES_REFERENCE}
											</pre>
										</CollapsibleContent>
									</Collapsible>
								</FormItem>
							)}
						/>
						{form.watch("logoUrl") && (
							<div className="rounded-lg border p-4 bg-muted/30">
								<p className="text-sm text-muted-foreground mb-2">
									Logo preview
								</p>
								<Logo
									className="size-12"
									logoUrl={form.watch("logoUrl") || undefined}
								/>
							</div>
						)}
						<Button type="submit" disabled={isPending}>
							{isPending ? "Saving..." : "Save"}
						</Button>
					</form>
				</Form>
			)}
		</div>
	);
};
