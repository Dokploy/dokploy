"use client";

import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { FieldArrayPath } from "react-hook-form";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
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
import { useUrl } from "@/utils/hooks/use-url";

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

const mappingSchema = z.object({
	id: z.string().min(1, "Required").trim(),
	email: z.string().min(1, "Required").trim(),
	emailVerified: z.string().trim(),
	name: z.string().min(1, "Required").trim(),
	image: z.string().trim(),
});

const oidcProviderSchema = z.object({
	providerId: z.string().min(1, "Provider ID is required").trim(),
	issuer: z.string().min(1, "Issuer URL is required").url("Invalid URL").trim(),
	domains: domainsArraySchema,
	clientId: z.string().min(1, "Client ID is required").trim(),
	clientSecret: z.string().min(1, "Client secret is required"),
	scopes: scopesArraySchema,
	mapping: mappingSchema,
});

type OidcProviderForm = z.infer<typeof oidcProviderSchema>;

type ClaimMapping = z.infer<typeof mappingSchema>;

const isAzureIssuer = (issuer: string) =>
	issuer.includes("login.microsoftonline.com");

// Microsoft Graph UserInfo endpoint (used by discovery) returns `email`, not
// `preferred_username` — the latter is only present in the ID token. Default
// Azure/Entra to the `email` claim so discovery-based login resolves the email.
const azureMapping: ClaimMapping = {
	id: "sub",
	email: "email",
	emailVerified: "email_verified",
	name: "name",
	image: "",
};

const genericMapping: ClaimMapping = {
	id: "sub",
	email: "email",
	emailVerified: "email_verified",
	name: "preferred_username",
	image: "picture",
};

const defaultMappingFor = (issuer: string): ClaimMapping =>
	isAzureIssuer(issuer) ? azureMapping : genericMapping;

const MAPPING_FIELDS: Array<{
	key: keyof ClaimMapping;
	label: string;
	placeholder: string;
	optional?: boolean;
}> = [
	{ key: "id", label: "User ID", placeholder: "sub" },
	{ key: "email", label: "Email", placeholder: "email" },
	{
		key: "emailVerified",
		label: "Email verified",
		placeholder: "email_verified",
		optional: true,
	},
	{ key: "name", label: "Name", placeholder: "name" },
	{ key: "image", label: "Image", placeholder: "picture", optional: true },
];

interface RegisterOidcDialogProps {
	providerId?: string;
	children: React.ReactNode;
}

const formDefaultValues = {
	providerId: "",
	issuer: "",
	domains: [""],
	clientId: "",
	clientSecret: "",
	scopes: [...DEFAULT_SCOPES],
	mapping: { ...genericMapping },
};

function parseOidcConfig(oidcConfig: string | null): {
	clientId?: string;
	clientSecret?: string;
	scopes?: string[];
	mapping?: Partial<ClaimMapping>;
} | null {
	if (!oidcConfig) return null;
	try {
		const parsed = JSON.parse(oidcConfig) as {
			clientId?: string;
			clientSecret?: string;
			scopes?: string[];
			mapping?: Partial<ClaimMapping>;
		};
		return {
			clientId: parsed.clientId,
			clientSecret: parsed.clientSecret,
			scopes: Array.isArray(parsed.scopes) ? parsed.scopes : undefined,
			mapping:
				parsed.mapping && typeof parsed.mapping === "object"
					? parsed.mapping
					: undefined,
		};
	} catch {
		return null;
	}
}

export function RegisterOidcDialog({
	providerId,
	children,
}: RegisterOidcDialogProps) {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);

	const { data } = api.sso.one.useQuery(
		{ providerId: providerId ?? "" },
		{ enabled: !!providerId && open },
	);
	const registerMutation = api.sso.register.useMutation();
	const updateMutation = api.sso.update.useMutation();

	const isEdit = !!providerId;
	const mutateAsync = isEdit
		? updateMutation.mutateAsync
		: registerMutation.mutateAsync;
	const isLoading = isEdit
		? updateMutation.isPending
		: registerMutation.isPending;

	const form = useForm<OidcProviderForm>({
		resolver: zodResolver(oidcProviderSchema),
		defaultValues: formDefaultValues,
	});

	const watchedProviderId = useWatch({
		control: form.control,
		name: "providerId",
		defaultValue: "",
	});

	const watchedIssuer = useWatch({
		control: form.control,
		name: "issuer",
		defaultValue: "",
	});

	const baseURL = useUrl();

	// Register mode: keep the mapping defaults in sync with the issuer so
	// Azure/Entra gets the `email`-claim default. Editing the issuer after
	// customizing the mapping resets it to the issuer's default.
	useEffect(() => {
		if (isEdit) return;
		form.setValue("mapping", { ...defaultMappingFor(watchedIssuer) });
	}, [watchedIssuer, isEdit, form]);

	useEffect(() => {
		if (!data || !open) return;
		const domains = data.domain
			? data.domain
					.split(",")
					.map((d) => d.trim())
					.filter(Boolean)
			: [""];
		if (domains.length === 0) domains.push("");
		const oidc = parseOidcConfig(data.oidcConfig);
		const baseMapping = defaultMappingFor(data.issuer);
		form.reset({
			providerId: data.providerId,
			issuer: data.issuer,
			domains,
			clientId: oidc?.clientId ?? "",
			clientSecret: oidc?.clientSecret ?? "",
			scopes:
				oidc?.scopes && oidc.scopes.length > 0
					? oidc.scopes
					: [...DEFAULT_SCOPES],
			mapping: {
				id: oidc?.mapping?.id ?? baseMapping.id,
				email: oidc?.mapping?.email ?? baseMapping.email,
				emailVerified:
					oidc?.mapping?.emailVerified ?? baseMapping.emailVerified,
				name: oidc?.mapping?.name ?? baseMapping.name,
				image: oidc?.mapping?.image ?? baseMapping.image,
			},
		});
	}, [data, open, form]);

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

			const mapping = {
				id: data.mapping.id.trim(),
				email: data.mapping.email.trim(),
				name: data.mapping.name.trim(),
				...(data.mapping.emailVerified.trim()
					? { emailVerified: data.mapping.emailVerified.trim() }
					: {}),
				...(data.mapping.image.trim()
					? { image: data.mapping.image.trim() }
					: {}),
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

			toast.success(
				isEdit
					? "OIDC provider updated successfully"
					: "OIDC provider registered successfully",
			);
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
					<DialogTitle>
						{isEdit ? "Update OIDC provider" : "Register OIDC provider"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Change issuer, domains, client settings or scopes. Provider ID cannot be changed."
							: "Add any OIDC-compliant identity provider (e.g. Okta, Azure AD, Google Workspace, Auth0, Keycloak). Discovery will fill endpoints from the issuer URL when possible."}
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
											placeholder="e.g. okta or my-idp"
											{...field}
											readOnly={isEdit}
											className={isEdit ? "bg-muted" : undefined}
										/>
									</FormControl>
									<FormDescription>
										Unique identifier; used in callback URL path.
										{isEdit && " Cannot be changed when editing."}
									</FormDescription>
									{baseURL && (
										<div className="rounded-md bg-muted px-3 py-2 text-xs">
											<p className="font-medium text-muted-foreground">
												Callback URL (configure in your IdP)
											</p>
											<p className="mt-0.5 break-all font-mono">
												{baseURL}/api/auth/sso/callback/
												{watchedProviderId?.trim() || "..."}
											</p>
										</div>
									)}
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
						<div className="space-y-2">
							<FormLabel>Claim mapping</FormLabel>
							<FormDescription>
								Which provider claims map to each user field. Defaults adapt to
								the issuer.
							</FormDescription>
							<div className="grid grid-cols-2 gap-3">
								{MAPPING_FIELDS.map(({ key, label, placeholder, optional }) => (
									<FormField
										key={key}
										control={form.control}
										name={`mapping.${key}`}
										render={({ field }) => (
											<FormItem>
												<FormLabel className="text-xs text-muted-foreground">
													{label}
													{optional ? " (optional)" : ""}
												</FormLabel>
												<FormControl>
													<Input placeholder={placeholder} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								))}
							</div>
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
								{isEdit ? "Update provider" : "Register provider"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
