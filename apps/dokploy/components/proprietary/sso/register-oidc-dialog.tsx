"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_SCOPES = ["openid", "email", "profile"];

interface RegisterOidcDialogProps {
	children: React.ReactNode;
	onSuccess?: () => void;
}

export function RegisterOidcDialog({ children, onSuccess }: RegisterOidcDialogProps) {
	const [open, setOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [form, setForm] = useState({
		providerId: "",
		issuer: "",
		domain: "",
		clientId: "",
		clientSecret: "",
		scopes: DEFAULT_SCOPES.join(" "),
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (
			!form.providerId.trim() ||
			!form.issuer.trim() ||
			!form.domain.trim() ||
			!form.clientId.trim() ||
			!form.clientSecret.trim()
		) {
			toast.error("Please fill in all required fields");
			return;
		}

		setIsSubmitting(true);
		try {
			const scopes = form.scopes
				.trim()
				.split(/\s+/)
				.filter(Boolean);
			const { data, error } = await authClient.sso.register({
				providerId: form.providerId.trim(),
				issuer: form.issuer.trim(),
				domain: form.domain.trim(),
				oidcConfig: {
					clientId: form.clientId.trim(),
					clientSecret: form.clientSecret.trim(),
					scopes: scopes.length > 0 ? scopes : DEFAULT_SCOPES,
					pkce: true,
				},
			});

			if (error) {
				toast.error(error.message ?? "Failed to register SSO provider");
				return;
			}

			toast.success("OIDC provider registered successfully");
			setForm({
				providerId: "",
				issuer: "",
				domain: "",
				clientId: "",
				clientSecret: "",
				scopes: DEFAULT_SCOPES.join(" "),
			});
			setOpen(false);
			onSuccess?.();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to register SSO provider",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Register OIDC provider</DialogTitle>
					<DialogDescription>
						Add an OpenID Connect (OIDC) identity provider. Discovery will
						fill endpoints from the issuer URL when possible.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="providerId">Provider ID</Label>
						<Input
							id="providerId"
							placeholder="e.g. okta or my-idp"
							value={form.providerId}
							onChange={(e) =>
								setForm((f) => ({ ...f, providerId: e.target.value }))
							}
						/>
						<p className="text-xs text-muted-foreground">
							Unique identifier; used in callback URL path.
						</p>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="issuer">Issuer URL</Label>
						<Input
							id="issuer"
							placeholder="https://idp.example.com"
							value={form.issuer}
							onChange={(e) =>
								setForm((f) => ({ ...f, issuer: e.target.value }))
							}
						/>
						<p className="text-xs text-muted-foreground">
							Discovery document is fetched from{" "}
							<code className="rounded bg-muted px-1">
								{"{issuer}"}/.well-known/openid-configuration
							</code>
						</p>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="domain">Domain</Label>
						<Input
							id="domain"
							placeholder="example.com"
							value={form.domain}
							onChange={(e) =>
								setForm((f) => ({ ...f, domain: e.target.value }))
							}
						/>
						<p className="text-xs text-muted-foreground">
							Email domain(s) that use this provider (e.g. for sign-in by email).
						</p>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="clientId">Client ID</Label>
						<Input
							id="clientId"
							placeholder="Client ID from IdP"
							value={form.clientId}
							onChange={(e) =>
								setForm((f) => ({ ...f, clientId: e.target.value }))
							}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="clientSecret">Client secret</Label>
						<Input
							id="clientSecret"
							type="password"
							placeholder="Client secret from IdP"
							value={form.clientSecret}
							onChange={(e) =>
								setForm((f) => ({ ...f, clientSecret: e.target.value }))
							}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="scopes">Scopes (optional)</Label>
						<Input
							id="scopes"
							placeholder="openid email profile"
							value={form.scopes}
							onChange={(e) =>
								setForm((f) => ({ ...f, scopes: e.target.value }))
							}
						/>
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
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting && (
								<Loader2 className="mr-2 size-4 animate-spin" />
							)}
							Register provider
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
