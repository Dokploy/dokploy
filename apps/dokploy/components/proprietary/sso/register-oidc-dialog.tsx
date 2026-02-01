"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FieldArrayPath } from "react-hook-form";
import { useFieldArray, useForm } from "react-hook-form";
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
import { api } from "@/utils/api";

const DEFAULT_SCOPES = ["openid", "email", "profile"];

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

const scopesArraySchema = z.array(z.string().trim());

const oidcProviderSchema = z.object({
	providerId: z.string().min(1, "Provider ID is required").trim(),
	issuer: z.string().min(1, "Issuer URL is required").url("Invalid URL").trim(),
	domains: domainsArraySchema,
	clientId: z.string().min(1, "Client ID is required").trim(),
	clientSecret: z.string().min(1, "Client secret is required"),
	scopes: scopesArraySchema,
});

type OidcProviderForm = z.infer<typeof oidcProviderSchema>;

interface RegisterOidcDialogProps {
	children: React.ReactNode;
}

const formDefaultValues = {
	providerId: "",
	issuer: "",
	domains: [""],
	clientId: "",
	clientSecret: "",
	scopes: [...DEFAULT_SCOPES],
};

export function RegisterOidcDialog({ children }: RegisterOidcDialogProps) {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const { mutateAsync, isLoading } = api.sso.register.useMutation();

	const form = useForm<OidcProviderForm>({
		resolver: zodResolver(oidcProviderSchema),
		defaultValues: formDefaultValues,
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "domains" as FieldArrayPath<OidcProviderForm>,
	});

	const {
		fields: scopeFields,
		append: appendScope,
		remove: removeScope,
	} = useFieldArray({
		control: form.control,
		name: "scopes" as FieldArrayPath<OidcProviderForm>,
	});

	const isSubmitting = form.formState.isSubmitting;

	const onSubmit = async (data: OidcProviderForm) => {
		try {
			const scopes = data.scopes.filter(Boolean).length
				? data.scopes.filter(Boolean)
				: DEFAULT_SCOPES;

			const isAzure = data.issuer.includes("login.microsoftonline.com");
			const mapping = isAzure
				? {
						id: "sub",
						email: "preferred_username",
						emailVerified: "email_verified",
						name: "name",
					}
				: {
						id: "sub",
						email: "email",
						emailVerified: "email_verified",
						name: "preferred_username",
						image: "picture",
					};
			await mutateAsync({
				providerId: data.providerId,
				issuer: data.issuer,
				domains: data.domains,
				oidcConfig: {
					clientId: data.clientId,
					clientSecret: data.clientSecret,
					scopes,
					pkce: true,
					mapping,
				},
			});

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
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<FormLabel>Domains</FormLabel>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8"
									onClick={() => (append as (value: string) => void)("")}
								>
									<Plus className="mr-1 size-4" />
									Add domain
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								Email domains that use this provider (sign-in by email and org
								assignment; subdomains matched automatically).
							</p>
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
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<FormLabel>Scopes (optional)</FormLabel>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8"
									onClick={() => (appendScope as (value: string) => void)("")}
								>
									<Plus className="mr-1 size-4" />
									Add scope
								</Button>
							</div>
							<FormDescription>
								OIDC scopes to request (e.g. openid, email, profile). If empty,
								openid, email and profile are used.
							</FormDescription>
							{scopeFields.map((field, index) => (
								<FormField
									key={field.id}
									control={form.control}
									name={`scopes.${index}`}
									render={({ field: inputField }) => (
										<FormItem>
											<FormControl>
												<div className="flex gap-2">
													<Input
														placeholder="openid"
														className="flex-1"
														{...inputField}
													/>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="shrink-0 text-muted-foreground hover:text-destructive"
														onClick={() => removeScope(index)}
														disabled={scopeFields.length <= 1}
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
						</div>
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
