"use client";

import {
	Eye,
	Loader2,
	LogIn,
	Pencil,
	Plus,
	Shield,
	Trash2,
} from "lucide-react";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { useUrl } from "@/utils/hooks/use-url";
import { RegisterOidcDialog } from "./register-oidc-dialog";
import { RegisterSamlDialog } from "./register-saml-dialog";

type ProviderForDetails = {
	id: string | null;
	providerId: string;
	issuer: string;
	domain: string;
	oidcConfig: string | null;
	samlConfig: string | null;
	organizationId: string | null;
};

function parseOidcConfig(config: string | null): {
	clientId?: string;
	scopes?: string[];
} | null {
	if (!config) return null;
	try {
		const parsed = JSON.parse(config) as {
			clientId?: string;
			scopes?: string[];
		};
		return { clientId: parsed.clientId, scopes: parsed.scopes };
	} catch {
		return null;
	}
}

function parseSamlConfig(
	config: string | null,
): { entryPoint?: string } | null {
	if (!config) return null;
	try {
		const parsed = JSON.parse(config) as { entryPoint?: string };
		return { entryPoint: parsed.entryPoint };
	} catch {
		return null;
	}
}

export const SSOSettings = () => {
	const utils = api.useUtils();
	const [detailsProvider, setDetailsProvider] =
		useState<ProviderForDetails | null>(null);
	const baseURL = useUrl();
	const [manageOriginsOpen, setManageOriginsOpen] = useState(false);
	const [editingOrigin, setEditingOrigin] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const [newOriginInput, setNewOriginInput] = useState("");

	const { data: providers, isLoading } = api.sso.listProviders.useQuery();
	const { data: userData } = api.user.get.useQuery(undefined, {
		enabled: manageOriginsOpen,
	});
	const { mutateAsync: deleteProvider, isLoading: isDeleting } =
		api.sso.deleteProvider.useMutation();
	const { mutateAsync: addTrustedOrigin, isLoading: isAddingOrigin } =
		api.sso.addTrustedOrigin.useMutation();
	const { mutateAsync: removeTrustedOrigin, isLoading: isRemovingOrigin } =
		api.sso.removeTrustedOrigin.useMutation();
	const { mutateAsync: updateTrustedOrigin, isLoading: isUpdatingOrigin } =
		api.sso.updateTrustedOrigin.useMutation();

	const trustedOrigins = userData?.user?.trustedOrigins ?? [];

	const handleAddOrigin = async () => {
		const value = newOriginInput.trim();
		if (!value) return;
		try {
			await addTrustedOrigin({ origin: value });
			toast.success("Trusted origin added");
			setNewOriginInput("");
			await utils.user.get.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to add trusted origin",
			);
		}
	};

	const handleRemoveOrigin = async (origin: string) => {
		try {
			await removeTrustedOrigin({ origin });
			toast.success("Trusted origin removed");
			if (editingOrigin === origin) setEditingOrigin(null);
			await utils.user.get.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to remove trusted origin",
			);
		}
	};

	const handleStartEdit = (origin: string) => {
		setEditingOrigin(origin);
		setEditingValue(origin);
	};

	const handleSaveEdit = async () => {
		if (editingOrigin == null || !editingValue.trim()) {
			setEditingOrigin(null);
			return;
		}
		try {
			await updateTrustedOrigin({
				oldOrigin: editingOrigin,
				newOrigin: editingValue.trim(),
			});
			toast.success("Trusted origin updated");
			setEditingOrigin(null);
			setEditingValue("");
			await utils.user.get.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to update trusted origin",
			);
		}
	};

	const handleCancelEdit = () => {
		setEditingOrigin(null);
		setEditingValue("");
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border p-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
				<Button
					variant="outline"
					size="sm"
					onClick={() => setManageOriginsOpen(true)}
					className="shrink-0"
				>
					<Shield className="mr-2 size-4" />
					Manage origins
				</Button>
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
							<RegisterOidcDialog>
								<Button variant="secondary" size="sm">
									<LogIn className="mr-2 size-4" />
									Add OIDC provider
								</Button>
							</RegisterOidcDialog>
							<RegisterSamlDialog>
								<Button variant="secondary" size="sm">
									<LogIn className="mr-2 size-4" />
									Add SAML provider
								</Button>
							</RegisterSamlDialog>
						</div>
					)}

					{providers && providers.length > 0 ? (
						<div className="space-y-3">
							<span className="text-sm font-medium">Registered providers</span>
							<div className="grid gap-3 sm:grid-cols-2">
								{providers.map((provider) => {
									const isOidc = !!provider.oidcConfig;
									const isSaml = !!provider.samlConfig;

									return (
										<Card
											key={provider.id}
											className="overflow-hidden bg-background"
										>
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
														</div>
													</div>
												</div>
											</CardHeader>
											<CardContent className="flex flex-wrap gap-2 pt-0">
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														setDetailsProvider({
															id: provider.id,
															providerId: provider.providerId,
															issuer: provider.issuer,
															domain: provider.domain,
															oidcConfig: provider.oidcConfig,
															samlConfig: provider.samlConfig,
															organizationId: provider.organizationId,
														})
													}
												>
													<Eye className="mr-1 size-3" />
													View details
												</Button>
												{isOidc && (
													<RegisterOidcDialog providerId={provider.providerId}>
														<Button variant="ghost" size="sm">
															<Pencil className="mr-1 size-3" />
															Edit
														</Button>
													</RegisterOidcDialog>
												)}
												{isSaml && (
													<RegisterSamlDialog providerId={provider.providerId}>
														<Button variant="ghost" size="sm">
															<Pencil className="mr-1 size-3" />
															Edit
														</Button>
													</RegisterSamlDialog>
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
										Add an OIDC or SAML provider so users can sign in with their
										organization&apos;s IdP (e.g. Okta, Azure AD).
									</p>
								</div>
							</div>
							<div className="flex flex-wrap gap-2 justify-center">
								<RegisterOidcDialog>
									<Button variant="secondary">
										<LogIn className="mr-2 size-4" />
										Add OIDC provider
									</Button>
								</RegisterOidcDialog>
								<RegisterSamlDialog>
									<Button variant="outline">
										<LogIn className="mr-2 size-4" />
										Add SAML provider
									</Button>
								</RegisterSamlDialog>
							</div>
						</div>
					)}
				</>
			)}

			<Dialog
				open={!!detailsProvider}
				onOpenChange={(open) => !open && setDetailsProvider(null)}
			>
				<DialogContent className="sm:max-w-[480px]">
					{detailsProvider && (
						<>
							<DialogHeader>
								<DialogTitle>SSO provider details</DialogTitle>
								<DialogDescription>
									Use Edit to change provider settings (OIDC or SAML).
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-3 py-2">
								<div className="grid gap-1">
									<span className="text-xs font-medium text-muted-foreground">
										Provider ID
									</span>
									<p className="rounded-md bg-muted px-2 py-1.5 font-mono text-sm">
										{detailsProvider.providerId}
									</p>
								</div>
								<div className="grid gap-1">
									<span className="text-xs font-medium text-muted-foreground">
										Issuer URL
									</span>
									<p className="break-all rounded-md bg-muted px-2 py-1.5 text-sm">
										{detailsProvider.issuer}
									</p>
								</div>
								<div className="grid gap-1">
									<span className="text-xs font-medium text-muted-foreground">
										Domain
									</span>
									<p className="rounded-md bg-muted px-2 py-1.5 text-sm">
										{detailsProvider.domain}
									</p>
								</div>
								{detailsProvider.oidcConfig && (
									<>
										{(() => {
											const oidc = parseOidcConfig(detailsProvider.oidcConfig);
											if (!oidc) return null;
											return (
												<>
													{oidc.clientId && (
														<div className="grid gap-1">
															<span className="text-xs font-medium text-muted-foreground">
																Client ID
															</span>
															<p className="rounded-md bg-muted px-2 py-1.5 font-mono text-sm">
																{oidc.clientId}
															</p>
														</div>
													)}
													{oidc.scopes && oidc.scopes.length > 0 && (
														<div className="grid gap-1">
															<span className="text-xs font-medium text-muted-foreground">
																Scopes
															</span>
															<p className="rounded-md bg-muted px-2 py-1.5 text-sm">
																{oidc.scopes.join(" ")}
															</p>
														</div>
													)}
												</>
											);
										})()}
									</>
								)}
								{detailsProvider.samlConfig && (
									<>
										{(() => {
											const saml = parseSamlConfig(detailsProvider.samlConfig);
											if (!saml?.entryPoint) return null;
											return (
												<div className="grid gap-1">
													<span className="text-xs font-medium text-muted-foreground">
														Entry point
													</span>
													<p className="break-all rounded-md bg-muted px-2 py-1.5 text-sm">
														{saml.entryPoint}
													</p>
												</div>
											);
										})()}
									</>
								)}
								<div className="grid gap-1">
									<span className="text-xs font-medium text-muted-foreground">
										Callback URL (configure in your IdP)
									</span>
									<p className="break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
										{baseURL || "{baseURL}"}
										{detailsProvider.samlConfig
											? "/api/auth/sso/saml2/callback/"
											: "/api/auth/sso/callback/"}
										{detailsProvider.providerId}
									</p>
									{!baseURL && (
										<p className="text-xs text-muted-foreground">
											Replace {"{baseURL}"} with your Dokploy URL (e.g. https://
											your-domain.com).
										</p>
									)}
								</div>
							</div>
							<DialogFooter>
								<Button
									variant="outline"
									onClick={() => setDetailsProvider(null)}
								>
									Close
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			<Dialog open={manageOriginsOpen} onOpenChange={setManageOriginsOpen}>
				<DialogContent className="sm:max-w-[480px]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Shield className="size-5" />
							Trusted origins
						</DialogTitle>
						<DialogDescription>
							Manage allowed origins for SSO callbacks. Add, edit, or remove
							origins for your account.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<span className="text-sm font-medium">Current origins</span>
							{trustedOrigins.length === 0 ? (
								<p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
									No trusted origins yet. Add one below.
								</p>
							) : (
								<ul className="flex flex-col gap-2">
									{trustedOrigins.map((origin) => (
										<li
											key={origin}
											className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
										>
											{editingOrigin === origin ? (
												<>
													<Input
														value={editingValue}
														onChange={(e) => setEditingValue(e.target.value)}
														placeholder="https://..."
														className="flex-1 font-mono text-sm"
														autoFocus
													/>
													<Button
														size="sm"
														onClick={handleSaveEdit}
														disabled={!editingValue.trim() || isUpdatingOrigin}
													>
														Save
													</Button>
													<Button
														size="sm"
														variant="ghost"
														onClick={handleCancelEdit}
													>
														Cancel
													</Button>
												</>
											) : (
												<>
													<span className="flex-1 break-all font-mono text-sm">
														{origin}
													</span>
													<Button
														variant="ghost"
														size="icon"
														className="size-8 shrink-0"
														onClick={() => handleStartEdit(origin)}
													>
														<Pencil className="size-3.5" />
													</Button>
													<DialogAction
														title="Remove trusted origin"
														description={`Remove "${origin}" from trusted origins?`}
														type="destructive"
														onClick={async () => handleRemoveOrigin(origin)}
													>
														<Button
															variant="ghost"
															size="icon"
															className="size-8 shrink-0 text-destructive hover:text-destructive"
															disabled={isRemovingOrigin}
														>
															<Trash2 className="size-3.5" />
														</Button>
													</DialogAction>
												</>
											)}
										</li>
									))}
								</ul>
							)}
						</div>
						<div className="space-y-2">
							<span className="text-sm font-medium">Add trusted origin</span>
							<div className="flex gap-2">
								<Input
									value={newOriginInput}
									onChange={(e) => setNewOriginInput(e.target.value)}
									placeholder="https://example.com"
									className="font-mono text-sm"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											void handleAddOrigin();
										}
									}}
								/>
								<Button
									size="sm"
									onClick={handleAddOrigin}
									disabled={!newOriginInput.trim() || isAddingOrigin}
								>
									<Plus className="mr-1 size-4" />
									Add
								</Button>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setManageOriginsOpen(false)}
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};
