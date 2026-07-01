"use client";

import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Loader2, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CodeEditor } from "@/components/shared/code-editor";
import { DialogAction } from "@/components/shared/dialog-action";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { WhitelabelingPreview } from "./whitelabeling-preview";

const safeUrlField = z
	.string()
	.refine((val) => val === "" || /^https?:\/\//i.test(val), {
		message: "Only http:// and https:// URLs are allowed",
	});

const formSchema = z.object({
	appName: z.string(),
	appDescription: z.string(),
	logoUrl: safeUrlField,
	faviconUrl: safeUrlField,
	customCss: z.string(),
	loginLogoUrl: safeUrlField,
	supportUrl: safeUrlField,
	docsUrl: safeUrlField,
	errorPageTitle: z.string(),
	errorPageDescription: z.string(),
	metaTitle: z.string(),
	footerText: z.string(),
});

type FormSchema = z.infer<typeof formSchema>;

const DEFAULT_CSS_TEMPLATE = `/* ============================================
   Dokploy Default Theme - CSS Variables
   Modify these values to customize your instance.

   Theme colors use the oklch() color format
   (Tailwind CSS v4). You can use any valid CSS
   color, e.g. oklch(0.6 0.2 250), #3b82f6 or
   hsl(217 91% 60%).

   Chart colors (--chart-*) are the exception:
   they are still declared as raw HSL triples
   (H S% L%) because they get wrapped in hsl(...)
   where they are used.
   ============================================ */

/* ---------- Light Mode ---------- */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);

  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);

  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);

  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);

  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);

  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);

  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);

  --destructive: oklch(0.577 0.245 27.325);

  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;

  /* Sidebar */
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);

  /* Charts (raw HSL triples: H S% L%) */
  --chart-1: 173 58% 39%;
  --chart-2: 12 76% 61%;
  --chart-3: 197 37% 24%;
  --chart-4: 43 74% 66%;
  --chart-5: 27 87% 67%;
}

/* ---------- Dark Mode ---------- */
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);

  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);

  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);

  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);

  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);

  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);

  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);

  --destructive: oklch(0.704 0.191 22.216);

  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);

  /* Sidebar */
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);

  /* Charts (raw HSL triples: H S% L%) */
  --chart-1: 220 70% 50%;
  --chart-2: 340 75% 55%;
  --chart-3: 30 80% 55%;
  --chart-4: 280 65% 60%;
  --chart-5: 160 60% 45%;
}

/* ---------- Custom Styles ---------- */
/* Add your own CSS rules below */
`;

export function WhitelabelingSettings() {
	const utils = api.useUtils();
	const {
		data,
		isPending: isLoading,
		refetch,
	} = api.whitelabeling.get.useQuery();

	const { mutateAsync: updateWhitelabeling, isPending: isUpdating } =
		api.whitelabeling.update.useMutation();

	const { mutateAsync: resetWhitelabeling, isPending: isResetting } =
		api.whitelabeling.reset.useMutation();

	const form = useForm<FormSchema>({
		defaultValues: {
			appName: "",
			appDescription: "",
			logoUrl: "",
			faviconUrl: "",
			customCss: "",
			loginLogoUrl: "",
			supportUrl: "",
			docsUrl: "",
			errorPageTitle: "",
			errorPageDescription: "",
			metaTitle: "",
			footerText: "",
		},
		resolver: zodResolver(formSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				appName: data.appName ?? "",
				appDescription: data.appDescription ?? "",
				logoUrl: data.logoUrl ?? "",
				faviconUrl: data.faviconUrl ?? "",
				customCss: data.customCss ?? "",
				loginLogoUrl: data.loginLogoUrl ?? "",
				supportUrl: data.supportUrl ?? "",
				docsUrl: data.docsUrl ?? "",
				errorPageTitle: data.errorPageTitle ?? "",
				errorPageDescription: data.errorPageDescription ?? "",
				metaTitle: data.metaTitle ?? "",
				footerText: data.footerText ?? "",
			});
		}
	}, [data, form]);

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 justify-center min-h-[25vh]">
				<Loader2 className="size-6 text-muted-foreground animate-spin" />
				<span className="text-sm text-muted-foreground">
					Loading whitelabeling settings...
				</span>
			</div>
		);
	}

	const onSubmit = async (values: FormSchema) => {
		await updateWhitelabeling({
			whitelabelingConfig: {
				appName: values.appName || null,
				appDescription: values.appDescription || null,
				logoUrl: values.logoUrl || null,
				faviconUrl: values.faviconUrl || null,
				customCss: values.customCss || null,
				loginLogoUrl: values.loginLogoUrl || null,
				supportUrl: values.supportUrl || null,
				docsUrl: values.docsUrl || null,
				errorPageTitle: values.errorPageTitle || null,
				errorPageDescription: values.errorPageDescription || null,
				metaTitle: values.metaTitle || null,
				footerText: values.footerText || null,
			},
		})
			.then(async () => {
				toast.success("Whitelabeling settings updated");
				await refetch();
				await utils.whitelabeling.getPublic.invalidate();
				await utils.whitelabeling.get.invalidate();
			})
			.catch((error) => {
				toast.error(
					error?.message || "Failed to update whitelabeling settings",
				);
			});
	};

	const handleReset = async () => {
		await resetWhitelabeling()
			.then(async () => {
				toast.success("Whitelabeling settings reset to defaults");
				await refetch();
				await utils.whitelabeling.getPublic.invalidate();
				await utils.whitelabeling.get.invalidate();
			})
			.catch((error) => {
				toast.error(error?.message || "Failed to reset whitelabeling settings");
			});
	};

	return (
		<div className="flex flex-col gap-6">
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex flex-col gap-6"
				>
					{/* Branding Section */}
					<Card className="bg-transparent">
						<CardHeader>
							<CardTitle>Branding</CardTitle>
							<CardDescription>
								Customize the application name, logos, and favicon to match your
								brand identity.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="appName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Application Name</FormLabel>
										<FormControl>
											<Input placeholder="Dokploy" {...field} />
										</FormControl>
										<FormDescription>
											Replaces "Dokploy" across the entire interface.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="appDescription"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Application Description</FormLabel>
										<FormControl>
											<Input
												placeholder="The Open Source alternative to Netlify, Vercel, Heroku."
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Tagline shown on the login/onboarding pages. Defaults to
											the standard Dokploy description if empty.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="logoUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Logo URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://example.com/logo.svg"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Main logo shown in the sidebar and header. Recommended
											size: 128x128px.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="loginLogoUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Login Page Logo URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://example.com/login-logo.svg"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Logo displayed on the login page. If empty, the main logo
											is used.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="faviconUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Favicon URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://example.com/favicon.ico"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Browser tab icon. Supports .ico, .png, and .svg formats.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* Appearance Section */}
					<Card className="bg-transparent">
						<CardHeader>
							<CardTitle>Appearance</CardTitle>
							<CardDescription>
								Customize the look and feel of the application with custom CSS.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="customCss"
								render={({ field }) => (
									<FormItem>
										<div className="flex items-center justify-between">
											<FormLabel>Custom CSS</FormLabel>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => {
													form.setValue("customCss", DEFAULT_CSS_TEMPLATE);
												}}
											>
												Load Default Styles
											</Button>
										</div>
										<FormControl>
											<div className="max-h-[350px] overflow-auto">
												<CodeEditor
													language="css"
													value={field.value}
													onChange={field.onChange}
													placeholder="/* Click 'Load Default Styles' to start with the base theme variables */"
													lineWrapping
												/>
											</div>
										</FormControl>
										<FormDescription>
											Inject custom CSS styles globally. Click "Load Default
											Styles" to get the base theme CSS variables as a starting
											point.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* Metadata & Links Section */}
					<Card className="bg-transparent">
						<CardHeader>
							<CardTitle>Metadata & Links</CardTitle>
							<CardDescription>
								Customize the page title, footer text, and sidebar links.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="metaTitle"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Page Title</FormLabel>
										<FormControl>
											<Input placeholder="Dokploy" {...field} />
										</FormControl>
										<FormDescription>
											Browser tab title. Defaults to "Dokploy" if empty.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="footerText"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Footer Text</FormLabel>
										<FormControl>
											<Input placeholder="Powered by Your Company" {...field} />
										</FormControl>
										<FormDescription>
											Custom text displayed in the footer area.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="supportUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Support URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://support.example.com"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Custom URL for the "Support" link in the sidebar.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="docsUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Documentation URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://docs.example.com"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Custom URL for the "Documentation" link in the sidebar.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* Error Pages Section */}
					<Card className="bg-transparent">
						<CardHeader>
							<CardTitle>Error Pages</CardTitle>
							<CardDescription>
								Customize the error page messages shown to users.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="errorPageTitle"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Error Page Title</FormLabel>
										<FormControl>
											<Input placeholder="Something went wrong" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="errorPageDescription"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Error Page Description</FormLabel>
										<FormControl>
											<Textarea
												placeholder="We're sorry, but an unexpected error occurred. Please try again later."
												className="min-h-[80px]"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* Actions */}
					<div className="flex items-center justify-between">
						<DialogAction
							title="Reset Whitelabeling"
							description="Are you sure you want to reset all whitelabeling settings to their defaults? This action cannot be undone."
							type="destructive"
							onClick={handleReset}
						>
							<Button variant="outline" type="button" isLoading={isResetting}>
								<RotateCcw className="size-4 mr-2" />
								Reset to Defaults
							</Button>
						</DialogAction>

						<Button type="submit" isLoading={isUpdating} disabled={isUpdating}>
							Save Changes
						</Button>
					</div>
				</form>
			</Form>

			{/* Live Preview */}
			<WhitelabelingPreview config={form.watch()} />
		</div>
	);
}
