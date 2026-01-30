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
import { Textarea } from "@/components/ui/textarea";

const samlProviderSchema = z.object({
	providerId: z.string().min(1, "Provider ID is required").trim(),
	issuer: z.string().min(1, "Issuer URL is required").url("Invalid URL").trim(),
	domain: z.string().min(1, "Domain is required").trim(),
	entryPoint: z
		.string()
		.min(1, "IdP SSO URL is required")
		.url("Invalid URL")
		.trim(),
	cert: z.string().min(1, "IdP signing certificate is required"),
	callbackUrl: z
		.string()
		.min(1, "Callback URL is required")
		.url("Invalid URL")
		.trim(),
	audience: z.string().min(1, "Audience (Entity ID) is required").trim(),
});

type SamlProviderForm = z.infer<typeof samlProviderSchema>;

interface RegisterSamlDialogProps {
	children: React.ReactNode;
}

const formDefaultValues: SamlProviderForm = {
	providerId: "",
	issuer: "",
	domain: "",
	entryPoint: "",
	cert: "",
	callbackUrl: "",
	audience: "",
};

export function RegisterSamlDialog({ children }: RegisterSamlDialogProps) {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);

	const form = useForm<SamlProviderForm>({
		resolver: zodResolver(samlProviderSchema),
		defaultValues: formDefaultValues,
	});

	const isSubmitting = form.formState.isSubmitting;

	const onSubmit = async (data: SamlProviderForm) => {
		try {
			const { error } = await authClient.sso.register({
				providerId: data.providerId,
				issuer: data.issuer,
				domain: data.domain,
				samlConfig: {
					entryPoint: data.entryPoint,
					cert: data.cert,
					callbackUrl: data.callbackUrl,
					audience: data.audience,
					wantAssertionsSigned: true,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
				},
			});

			if (error) {
				toast.error(error.message ?? "Failed to register SAML provider");
				return;
			}

			toast.success("SAML provider registered successfully");
			form.reset(formDefaultValues);
			setOpen(false);
			await utils.sso.listProviders.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to register SAML provider",
			);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Register SAML provider</DialogTitle>
					<DialogDescription>
						Add a SAML 2.0 identity provider (e.g. Okta SAML, Azure AD SAML,
						OneLogin). You need the IdP&apos;s SSO URL and signing certificate.
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
										<Input
											placeholder="e.g. okta-saml or azure-saml"
											{...field}
										/>
									</FormControl>
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
										<Input
											placeholder="https://idp.example.com"
											{...field}
										/>
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
									<FormLabel>Domain</FormLabel>
									<FormControl>
										<Input placeholder="example.com" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="entryPoint"
							render={({ field }) => (
								<FormItem>
									<FormLabel>IdP SSO URL (Entry point)</FormLabel>
									<FormControl>
										<Input
											placeholder="https://idp.example.com/sso"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Single Sign-On URL from your IdP&apos;s SAML setup.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="cert"
							render={({ field }) => (
								<FormItem>
									<FormLabel>IdP signing certificate (X.509)</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Paste IdP signing certificate (PEM, BEGIN CERTIFICATE / END CERTIFICATE)"
											rows={4}
											className="font-mono text-xs"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="callbackUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Callback URL (ACS)</FormLabel>
									<FormControl>
										<Input
											placeholder="https://yourapp.com/api/auth/sso/saml2/callback/my-provider"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Use the callback URL shown in your IdP app config for this
										provider.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="audience"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Audience (Entity ID)</FormLabel>
									<FormControl>
										<Input
											placeholder="https://yourapp.com"
											{...field}
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
