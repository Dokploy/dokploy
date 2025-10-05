"use client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "@/utils/api";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const FormSchema = z.object({
	enabled: z.boolean().default(false),
	displayName: z.string().trim().optional(),
	providerId: z.string().trim().min(1, "Provider ID is required"),
	domain: z.string().trim().optional(),
	issuer: z.string().trim().url("Issuer must be a valid URL"),
	discoveryUrl: z
		.string()
		.trim()
		.url("Discovery URL must be a valid URL"),
	clientId: z.string().trim().min(1, "Client ID is required"),
	clientSecret: z.string().trim().min(1, "Client secret is required"),
	scopes: z.string().trim().optional(),
	pkce: z.boolean().default(true),
	overrideUserInfo: z.boolean().default(false),
	mappingId: z.string().trim().optional(),
	mappingEmail: z.string().trim().optional(),
	mappingEmailVerified: z.string().trim().optional(),
	mappingName: z.string().trim().optional(),
	mappingImage: z.string().trim().optional(),
});

type FormValues = z.infer<typeof FormSchema>;

const toScopeString = (scopes: string[] | undefined) =>
	scopes?.length ? scopes.join(", ") : "openid, email, profile";

export const SSOSettings = () => {
	const utils = api.useUtils();
	const { data, isLoading } = api.sso.getSettings.useQuery();
	const { mutateAsync, isLoading: isSaving } = api.sso.updateSettings.useMutation({
		onSuccess: async () => {
			await utils.sso.getSettings.invalidate();
		},
	});

	const form = useForm<FormValues>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			enabled: false,
			displayName: "OpenID Connect",
			providerId: "oidc",
			domain: "",
			issuer: "",
			discoveryUrl: "",
			clientId: "",
			clientSecret: "",
			scopes: "openid, email, profile",
			pkce: true,
			overrideUserInfo: false,
			mappingId: "sub",
			mappingEmail: "email",
			mappingEmailVerified: "email_verified",
			mappingName: "name",
			mappingImage: "picture",
		},
	});

	useEffect(() => {
		if (!data) return;
		form.reset({
			enabled: data.enabled,
			displayName: data.displayName ?? "OpenID Connect",
			providerId: data.providerId,
			domain: data.domain ?? "",
			issuer: data.issuer ?? "",
			discoveryUrl: data.discoveryUrl ?? "",
			clientId: data.clientId ?? "",
			clientSecret: data.clientSecret ?? "",
			scopes: toScopeString(data.scopes),
			pkce: data.pkce,
			overrideUserInfo: data.overrideUserInfo,
			mappingId: data.mapping?.id ?? "sub",
			mappingEmail: data.mapping?.email ?? "email",
			mappingEmailVerified: data.mapping?.emailVerified ?? "email_verified",
			mappingName: data.mapping?.name ?? "name",
			mappingImage: data.mapping?.image ?? "picture",
		});
	}, [data, form]);

	const providerId = form.watch("providerId");
	const callbackUrl = useMemo(() => {
		const base =
			typeof window !== "undefined"
				? window.location.origin
				: typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL
					? process.env.NEXT_PUBLIC_APP_URL
					: "";
		const suffix = `/api/auth/sso/callback/${providerId || "oidc"}`;
		return base ? `${base}${suffix}` : suffix;
	}, [providerId]);

	const onSubmit = async (values: FormValues) => {
		const scopes = values.scopes
			?.split(/[,\n]/)
			.map((scope) => scope.trim())
			.filter(Boolean) ?? ["openid", "email", "profile"];

		try {
			await mutateAsync({
				enabled: values.enabled,
				providerId: values.providerId,
				displayName: values.displayName,
				domain: values.domain ? values.domain : null,
				issuer: values.issuer,
				discoveryUrl: values.discoveryUrl,
				clientId: values.clientId,
				clientSecret: values.clientSecret,
				scopes,
				pkce: values.pkce,
				overrideUserInfo: values.overrideUserInfo,
				mapping: {
					id: values.mappingId || undefined,
					email: values.mappingEmail || undefined,
					emailVerified: values.mappingEmailVerified || undefined,
					name: values.mappingName || undefined,
					image: values.mappingImage || undefined,
				},
			});
			toast.success("OIDC settings saved");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save settings";
			toast.error(message);
		}
	};

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<LogIn className="h-5 w-5" />
						Single Sign-On
					</CardTitle>
					<CardDescription>Loading current configuration…</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<LogIn className="h-5 w-5" />
					Single Sign-On (OIDC)
				</CardTitle>
				<CardDescription>
					Configure an OpenID Connect provider to allow users to authenticate
					on Dokploy using your identity provider.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="flex flex-col gap-8"
					>
						<div className="grid gap-6 md:grid-cols-2">
							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<FormItem className="flex flex-col gap-2">
										<div className="flex items-center justify-between">
											<div>
												<FormLabel>Enable OIDC</FormLabel>
												<FormDescription>
													Allow users to sign in using the configured provider.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</div>
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="providerId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Provider ID</FormLabel>
										<FormControl>
											<Input placeholder="oidc" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="displayName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Display name</FormLabel>
										<FormControl>
											<Input placeholder="OpenID Connect" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="domain"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Domain (optional)</FormLabel>
										<FormControl>
											<Input placeholder="example.com" {...field} />
										</FormControl>
										<FormDescription>
											Used to match users by email domain. Leave blank to
												derive from the issuer URL.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<FormField
								control={form.control}
								name="issuer"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Issuer</FormLabel>
										<FormControl>
											<Input
												placeholder="https://idp.example.com/realms/myrealm"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="discoveryUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Discovery URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://idp.example.com/realms/myrealm/.well-known/openid-configuration"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="clientId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Client ID</FormLabel>
										<FormControl>
											<Input placeholder="dokploy" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="clientSecret"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Client secret</FormLabel>
										<FormControl>
											<Input type="password" placeholder="••••••" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="scopes"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Scopes</FormLabel>
									<FormControl>
										<Textarea
											rows={2}
											placeholder="openid, email, profile"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Comma or newline separated list sent to the provider.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="grid gap-6 md:grid-cols-2">
							<FormField
								control={form.control}
								name="pkce"
								render={({ field }) => (
									<FormItem className="flex items-center justify-between rounded-md border p-3">
										<div>
											<FormLabel>PKCE</FormLabel>
											<FormDescription>
												Use Proof Key for Code Exchange when possible.
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
							<FormField
								control={form.control}
								name="overrideUserInfo"
								render={({ field }) => (
									<FormItem className="flex items-center justify-between rounded-md border p-3">
										<div>
											<FormLabel>Override profile data</FormLabel>
											<FormDescription>
												Replace the Dokploy user profile with data from the
												identity provider on each sign in.
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
						</div>

						<section className="grid gap-6 md:grid-cols-2">
							<div className="space-y-2">
								<h3 className="text-sm font-medium">Claim mapping</h3>
								<p className="text-sm text-muted-foreground">
									Map fields from your provider to Dokploy user properties.
								</p>
							</div>
							<div className="grid gap-3">
								<FormField
									control={form.control}
									name="mappingId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Identifier</FormLabel>
											<FormControl>
												<Input placeholder="sub" {...field} />
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="mappingEmail"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Email</FormLabel>
											<FormControl>
												<Input placeholder="email" {...field} />
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="mappingEmailVerified"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Email verified</FormLabel>
											<FormControl>
												<Input placeholder="email_verified" {...field} />
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
							<div className="grid gap-3">
								<FormField
									control={form.control}
									name="mappingName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input placeholder="name" {...field} />
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="mappingImage"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Avatar URL</FormLabel>
											<FormControl>
												<Input placeholder="picture" {...field} />
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
						</section>

						<div className="space-y-2">
							<h3 className="text-sm font-medium">Callback URL</h3>
							<p className="text-sm text-muted-foreground break-all">
								Provide this URL as the redirect URI in your identity provider:
							</p>
							<code className="block rounded-md bg-muted p-3 text-sm">
								{callbackUrl}
							</code>
						</div>

						<div className="flex justify-end gap-3">
							<Button
								type="submit"
								disabled={isSaving}
							>
								{isSaving ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving
									</>
								) : (
									"Save changes"
								)}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
