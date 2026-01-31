"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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

const DEFAULT_SCOPES = ["openid", "email", "profile"];

const oidcProviderSchema = z.object({
	providerId: z.string().min(1, "Provider ID is required").trim(),
	issuer: z.string().min(1, "Issuer URL is required").url("Invalid URL").trim(),
	domain: z.string().min(1, "Domain is required").trim(),
	clientId: z.string().min(1, "Client ID is required").trim(),
	clientSecret: z.string().min(1, "Client secret is required"),
	scopes: z.string().optional(),
});

type OidcProviderForm = z.infer<typeof oidcProviderSchema>;

interface RegisterOidcDialogProps {
	children: React.ReactNode;
}

const formDefaultValues: OidcProviderForm = {
	providerId: "",
	issuer: "",
	domain: "",
	clientId: "",
	clientSecret: "",
	scopes: DEFAULT_SCOPES.join(" "),
};

export function RegisterOidcDialog({ children }: RegisterOidcDialogProps) {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);

	const form = useForm<OidcProviderForm>({
		resolver: zodResolver(oidcProviderSchema),
		defaultValues: formDefaultValues,
	});

	const isSubmitting = form.formState.isSubmitting;

	const onSubmit = async (data: OidcProviderForm) => {
		try {
			const scopes = data.scopes?.trim()
				? data.scopes.trim().split(/\s+/).filter(Boolean)
				: DEFAULT_SCOPES;
			const { error } = await authClient.sso.register({
				providerId: data.providerId,
				issuer: data.issuer,
				domain: data.domain,
				oidcConfig: {
					clientId: data.clientId,
					clientSecret: data.clientSecret,
					scopes,
					pkce: true,
				},
			});

			if (error) {
				toast.error(error.message ?? "Failed to register SSO provider");
				return;
			}

			toast.success("OIDC provider registered successfully");
			form.reset(formDefaultValues);
			setOpen(false);
			await utils.sso.listProviders.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to register SSO provider",
			);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Register OIDC provider</DialogTitle>
					<DialogDescription>
						Add any OIDC-compliant identity provider (e.g. Okta, Azure AD,
						Google Workspace, Auth0, Keycloak). Discovery will fill endpoints
						from the issuer URL when possible.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="providerId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Provider ID</FormLabel>
									<FormControl>
										<Input placeholder="e.g. okta or my-idp" {...field} />
									</FormControl>
									<FormDescription>
										Unique identifier; used in callback URL path.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="issuer"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Issuer URL</FormLabel>
									<FormControl>
										<Input placeholder="https://idp.example.com" {...field} />
									</FormControl>
									<FormDescription>
										Discovery document is fetched from{" "}
										<code className="rounded bg-muted px-1">
											{"{issuer}"}/.well-known/openid-configuration
										</code>
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="domain"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Domain</FormLabel>
									<FormControl>
										<Input placeholder="example.com" {...field} />
									</FormControl>
									<FormDescription>
										Email domain(s) that use this provider (e.g. for sign-in by
										email).
									</FormDescription>
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
										<Input placeholder="Client ID from IdP" {...field} />
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
										<Input
											type="password"
											placeholder="Client secret from IdP"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="scopes"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Scopes (optional)</FormLabel>
									<FormControl>
										<Input
											placeholder="openid email profile"
											{...field}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
								disabled={isSubmitting}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting && (
									<Loader2 className="mr-2 size-4 animate-spin" />
								)}
								Register provider
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
