"use client";

import { Loader2, LogIn, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";
import { RegisterOidcDialog } from "./register-oidc-dialog";

export function SSOSettings() {
	const utils = api.useUtils();
	const { data: providers, isLoading } = api.sso.listProviders.useQuery();
	const { mutateAsync: deleteProvider, isLoading: isDeleting } =
		api.sso.deleteProvider.useMutation();

	const [verifyingId, setVerifyingId] = useState<string | null>(null);
	const [requestingVerificationId, setRequestingVerificationId] = useState<
		string | null
	>(null);

	const handleVerifyDomain = async (providerId: string) => {
		setVerifyingId(providerId);
		try {
			const { data, error } = await authClient.sso.verifyDomain({
				providerId,
			});
			if (error) {
				toast.error(error.message ?? "Domain verification failed");
				return;
			}
			toast.success("Domain verified successfully");
			await utils.sso.listProviders.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Domain verification failed",
			);
		} finally {
			setVerifyingId(null);
		}
	};

	const handleRequestDomainVerification = async (providerId: string) => {
		setRequestingVerificationId(providerId);
		try {
			const { data, error } = await authClient.sso.requestDomainVerification({
				providerId,
			});
			if (error) {
				toast.error(error.message ?? "Failed to request domain verification");
				return;
			}
			toast.success(
				"Verification token created. Add the TXT DNS record and verify.",
			);
			await utils.sso.listProviders.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Failed to request domain verification",
			);
		} finally {
			setRequestingVerificationId(null);
		}
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border p-4">
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<LogIn className="size-6 text-muted-foreground" />
					<CardTitle className="text-xl">Single Sign-On (SSO)</CardTitle>
				</div>
				<CardDescription>
					Configure OIDC or SAML identity providers for enterprise sign-in.
					Users can sign in with their organization&apos;s IdP.
				</CardDescription>
			</div>

			{isLoading ? (
				<div className="flex items-center gap-2 justify-center min-h-[25vh]">
					<Loader2 className="size-6 text-muted-foreground animate-spin" />
					<span className="text-sm text-muted-foreground">
						Loading providers...
					</span>
				</div>
			) : (
				<>
					{providers && providers.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							<RegisterOidcDialog
								onSuccess={() => utils.sso.listProviders.invalidate()}
							>
								<Button variant="secondary" size="sm">
									<LogIn className="mr-2 size-4" />
									Add OIDC provider
								</Button>
							</RegisterOidcDialog>
							<span className="text-xs text-muted-foreground">
								SAML support can be added via API or future UI.
							</span>
						</div>
					)}

					{providers && providers.length > 0 ? (
						<div className="space-y-3">
							<span className="text-sm font-medium">Registered providers</span>
							<div className="grid gap-3 sm:grid-cols-2">
								{providers.map((provider) => {
									const isOidc = !!provider.oidcConfig;
									const isSaml = !!provider.samlConfig;
									const verified = !!provider.domainVerified;

									return (
										<Card key={provider.id} className="overflow-hidden">
											<CardHeader className="pb-2">
												<div className="flex items-start justify-between gap-2">
													<div className="flex flex-col gap-1">
														<CardTitle className="text-base font-medium">
															{provider.providerId}
														</CardTitle>
														<CardDescription className="text-xs">
															{provider.issuer}
														</CardDescription>
														<div className="flex flex-wrap gap-1 mt-1">
															<Badge variant="secondary" className="text-xs">
																{provider.domain}
															</Badge>
															{isOidc && (
																<Badge variant="outline" className="text-xs">
																	OIDC
																</Badge>
															)}
															{isSaml && (
																<Badge variant="outline" className="text-xs">
																	SAML
																</Badge>
															)}
															{verified && (
																<Badge
																	variant="default"
																	className="text-xs bg-green-600"
																>
																	Verified
																</Badge>
															)}
														</div>
													</div>
												</div>
											</CardHeader>
											<CardContent className="flex flex-wrap gap-2 pt-0">
												{!verified && (
													<>
														<Button
															variant="outline"
															size="sm"
															disabled={verifyingId === provider.providerId}
															onClick={() =>
																handleVerifyDomain(provider.providerId)
															}
														>
															{verifyingId === provider.providerId ? (
																<Loader2 className="mr-1 size-3 animate-spin" />
															) : (
																<ShieldCheck className="mr-1 size-3" />
															)}
															Verify domain
														</Button>
														<Button
															variant="ghost"
															size="sm"
															disabled={
																requestingVerificationId === provider.providerId
															}
															onClick={() =>
																handleRequestDomainVerification(
																	provider.providerId,
																)
															}
														>
															{requestingVerificationId ===
															provider.providerId ? (
																<Loader2 className="mr-1 size-3 animate-spin" />
															) : null}
															New verification token
														</Button>
													</>
												)}
												<DialogAction
													title="Remove SSO provider"
													description={`Remove provider "${provider.providerId}"? Users will no longer be able to sign in with this IdP.`}
													type="destructive"
													onClick={async () => {
														try {
															await deleteProvider({
																providerId: provider.providerId,
															});
															toast.success("Provider removed");
															await utils.sso.listProviders.invalidate();
														} catch (err) {
															toast.error(
																err instanceof Error
																	? err.message
																	: "Failed to remove provider",
															);
														}
													}}
												>
													<Button
														variant="ghost"
														size="sm"
														className="text-destructive hover:text-destructive"
														disabled={isDeleting}
													>
														<Trash2 className="mr-1 size-3" />
														Remove
													</Button>
												</DialogAction>
											</CardContent>
										</Card>
									);
								})}
							</div>
						</div>
					) : (
						<div className="flex flex-col items-center gap-4 justify-center min-h-[30vh] text-center">
							<div className="flex flex-col items-center gap-2 max-w-[400px]">
								<div className="rounded-full bg-muted p-4">
									<LogIn className="size-8 text-muted-foreground" />
								</div>
								<div className="space-y-1">
									<h3 className="text-lg font-semibold">No SSO providers</h3>
									<p className="text-sm text-muted-foreground">
										Add an OIDC provider to allow users to sign in with their
										organization&apos;s identity provider (e.g. Okta, Azure AD).
									</p>
								</div>
							</div>
							<RegisterOidcDialog
								onSuccess={() => utils.sso.listProviders.invalidate()}
							>
								<Button variant="secondary">
									<LogIn className="mr-2 size-4" />
									Add OIDC provider
								</Button>
							</RegisterOidcDialog>
						</div>
					)}
				</>
			)}
		</div>
	);
}
