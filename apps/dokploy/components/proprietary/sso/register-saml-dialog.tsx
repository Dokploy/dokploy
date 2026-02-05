"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { type FieldArrayPath, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { api } from "@/utils/api";

const domainsArraySchema = z
	.array(z.string().trim())
	.superRefine((arr, ctx) => {
		const filled = arr.filter((s) => s.length > 0);
		if (filled.length < 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "At least one domain is required",
				path: [],
			});
		}
	});

const samlProviderSchema = z.object({
	providerId: z.string().min(1, "Provider ID is required").trim(),
	issuer: z.string().min(1, "Issuer URL is required").url("Invalid URL").trim(),
	domains: domainsArraySchema,
	entryPoint: z
		.string()
		.min(1, "IdP SSO URL is required")
		.url("Invalid URL")
		.trim(),
	cert: z.string().min(1, "IdP signing certificate is required"),
	idpMetadataXml: z.string().optional(),
});

type SamlProviderForm = z.infer<typeof samlProviderSchema>;

interface RegisterSamlDialogProps {
	children: React.ReactNode;
}

const formDefaultValues: SamlProviderForm = {
	providerId: "",
	issuer: "",
	domains: [""],
	entryPoint: "",
	cert: "",
	idpMetadataXml: "",
};

export function RegisterSamlDialog({ children }: RegisterSamlDialogProps) {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const { mutateAsync, isLoading } = api.sso.register.useMutation();

	const [baseURL, setBaseURL] = useState("");

	useEffect(() => {
		if (typeof window !== "undefined") {
			setBaseURL(window.location.origin);
		}
	}, []);

	const form = useForm<SamlProviderForm>({
		resolver: zodResolver(samlProviderSchema),
		defaultValues: formDefaultValues,
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "domains" as FieldArrayPath<SamlProviderForm>,
	});

	const isSubmitting = form.formState.isSubmitting;

	const onSubmit = async (data: SamlProviderForm) => {
		try {
			// maybe add the /saml/metadata endpoint to the baseURL
			const baseURLWithMetadata = `${baseURL}/saml/metadata`;
			const generateSpMetadata = (providerId: string) => {
				return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${baseURL}">
    <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${baseURL}/api/auth/sso/saml2/callback/${providerId}" index="1"/>
    </md:SPSSODescriptor>
</md:EntityDescriptor>`;
			};

			await mutateAsync({
				providerId: data.providerId,
				issuer: data.issuer,
				domains: data.domains,
				samlConfig: {
					entryPoint: data.entryPoint,
					cert: data.cert,
					callbackUrl: `${baseURL}/api/auth/sso/saml2/callback/${data.providerId}`,
					audience: baseURL,
					idpMetadata: data.idpMetadataXml?.trim()
						? { metadata: data.idpMetadataXml.trim() }
						: undefined,
					spMetadata: {
						metadata: generateSpMetadata(data.providerId),
					},
					mapping: {
						id: "nameID",
						email: "email",
						name: "displayName",
						firstName: "givenName",
						lastName: "surname",
					},
				},
			});

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
										<Input placeholder="https://idp.example.com" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<FormLabel>Domains</FormLabel>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8"
									onClick={() => append("")}
								>
									<Plus className="mr-1 size-4" />
									Add domain
								</Button>
							</div>
							<FormDescription>
								Email domains that use this provider (sign-in by email and org
								assignment; subdomains matched automatically).
							</FormDescription>
							{fields.map((field, index) => (
								<FormField
									key={field.id}
									control={form.control}
									name={`domains.${index}`}
									render={({ field: inputField }) => (
										<FormItem>
											<FormControl>
												<div className="flex gap-2">
													<Input
														placeholder="company.com"
														className="flex-1"
														{...inputField}
													/>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="shrink-0 text-muted-foreground hover:text-destructive"
														onClick={() => remove(index)}
														disabled={fields.length <= 1}
													>
														<Trash2 className="size-4" />
													</Button>
												</div>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							))}
							{(() => {
								const err = form.formState.errors.domains;
								const msg =
									typeof err?.message === "string"
										? err.message
										: (err as { root?: { message?: string } } | undefined)?.root
												?.message;
								return msg ? (
									<p className="text-sm font-medium text-destructive">{msg}</p>
								) : null;
							})()}
						</div>
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
							name="idpMetadataXml"
							render={({ field }) => (
								<FormItem>
									<FormLabel>IdP metadata XML (optional)</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Paste full IdP metadata XML if you have it (EntityDescriptor). Otherwise leave empty and use Issuer, IdP SSO URL and certificate above."
											rows={5}
											className="font-mono text-xs"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Some IdPs require full metadata; paste the XML here to
										override issuer/entry point/cert.
									</FormDescription>
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
							<Button type="submit" isLoading={isLoading}>
								Register provider
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
