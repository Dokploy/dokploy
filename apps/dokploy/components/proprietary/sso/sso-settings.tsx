"use client";

import {
	Eye,
	KeyRound,
	Loader2,
	LogIn,
	Pencil,
	Plus,
	Shield,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { ScimDialog } from "./scim-dialog";

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
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [detailsProvider, setDetailsProvider] =
		useState<ProviderForDetails | null>(null);
	const baseURL = useUrl();
	const [manageOriginsOpen, setManageOriginsOpen] = useState(false);
	const [editingOrigin, setEditingOrigin] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const [newOriginInput, setNewOriginInput] = useState("");

	const { data: providers, isPending } = api.sso.listProviders.useQuery();
	const { data: trustedOrigins = [] } = api.sso.getTrustedOrigins.useQuery(
		undefined,
		{ enabled: manageOriginsOpen },
	);
	const { mutateAsync: deleteProvider, isPending: isDeleting } =
		api.sso.deleteProvider.useMutation();
	const { mutateAsync: addTrustedOrigin, isPending: isAddingOrigin } =
		api.sso.addTrustedOrigin.useMutation();
	const { mutateAsync: removeTrustedOrigin, isPending: isRemovingOrigin } =
		api.sso.removeTrustedOrigin.useMutation();
	const { mutateAsync: updateTrustedOrigin, isPending: isUpdatingOrigin } =
		api.sso.updateTrustedOrigin.useMutation();

	const handleAddOrigin = async () => {
		const value = newOriginInput.trim();
		if (!value) return;
		try {
			await addTrustedOrigin({ origin: value });
			toast.success(t("sso.originAdded"));
			setNewOriginInput("");
			await utils.sso.getTrustedOrigins.invalidate();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t("sso.originAddError"));
		}
	};

	const handleRemoveOrigin = async (origin: string) => {
		try {
			await removeTrustedOrigin({ origin });
			toast.success(t("sso.originRemoved"));
			if (editingOrigin === origin) setEditingOrigin(null);
			await utils.sso.getTrustedOrigins.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("sso.originRemoveError"),
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
			toast.success(t("sso.originUpdated"));
			setEditingOrigin(null);
			setEditingValue("");
			await utils.sso.getTrustedOrigins.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("sso.originUpdateError"),
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
						<CardTitle className="text-xl">{t("sso.title")}</CardTitle>
					</div>
					<CardDescription>{t("sso.description")}</CardDescription>
				</div>
				<div className="flex flex-wrap gap-2 shrink-0">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setManageOriginsOpen(true)}
					>
						<Shield className="mr-2 size-4" />
						{t("sso.manageOrigins")}
					</Button>
					<ScimDialog>
						<Button variant="outline" size="sm">
							<KeyRound className="mr-2 size-4" />
							{t("sso.manageScim")}
						</Button>
					</ScimDialog>
				</div>
			</div>

			{isPending ? (
				<div className="flex items-center gap-2 justify-center min-h-[25vh]">
					<Loader2 className="size-6 text-muted-foreground animate-spin" />
					<span className="text-sm text-muted-foreground">
						{t("sso.loadingProviders")}
					</span>
				</div>
			) : (
				<>
					{providers && providers.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							<RegisterOidcDialog>
								<Button variant="secondary" size="sm">
									<LogIn className="mr-2 size-4" />
									{t("sso.addOidcProvider")}
								</Button>
							</RegisterOidcDialog>
							<RegisterSamlDialog>
								<Button variant="secondary" size="sm">
									<LogIn className="mr-2 size-4" />
									{t("sso.addSamlProvider")}
								</Button>
							</RegisterSamlDialog>
						</div>
					)}

					{providers && providers.length > 0 ? (
						<div className="space-y-3">
							<span className="text-sm font-medium">
								{t("sso.registeredProviders")}
							</span>
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
													{t("sso.viewDetails")}
												</Button>
												{isOidc && (
													<RegisterOidcDialog providerId={provider.providerId}>
														<Button variant="ghost" size="sm">
															<Pencil className="mr-1 size-3" />
															{t("sso.edit")}
														</Button>
													</RegisterOidcDialog>
												)}
												{isSaml && (
													<RegisterSamlDialog providerId={provider.providerId}>
														<Button variant="ghost" size="sm">
															<Pencil className="mr-1 size-3" />
															{t("sso.edit")}
														</Button>
													</RegisterSamlDialog>
												)}
												<DialogAction
													title={t("sso.removeProviderTitle")}
													description={t("sso.removeProviderDescription", {
														name: provider.providerId,
													})}
													type="destructive"
													onClick={async () => {
														try {
															await deleteProvider({
																providerId: provider.providerId,
															});
															toast.success(t("sso.providerRemoved"));
															await utils.sso.listProviders.invalidate();
														} catch (err) {
															toast.error(
																err instanceof Error
																	? err.message
																	: t("sso.removeProviderError"),
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
														{t("sso.remove")}
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
									<h3 className="text-lg font-semibold">
										{t("sso.noProvidersTitle")}
									</h3>
									<p className="text-sm text-muted-foreground">
										{t("sso.noProvidersDescription")}
									</p>
								</div>
							</div>
							<div className="flex flex-wrap gap-2 justify-center">
								<RegisterOidcDialog>
									<Button variant="secondary">
										<LogIn className="mr-2 size-4" />
										{t("sso.addOidcProvider")}
									</Button>
								</RegisterOidcDialog>
								<RegisterSamlDialog>
									<Button variant="outline">
										<LogIn className="mr-2 size-4" />
										{t("sso.addSamlProvider")}
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
								<DialogTitle>{t("sso.detailsTitle")}</DialogTitle>
								<DialogDescription>
									{t("sso.detailsDescription")}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-3 py-2">
								<div className="grid gap-1">
									<span className="text-xs font-medium text-muted-foreground">
										{t("sso.providerId")}
									</span>
									<p className="rounded-md bg-muted px-2 py-1.5 font-mono text-sm">
										{detailsProvider.providerId}
									</p>
								</div>
								<div className="grid gap-1">
									<span className="text-xs font-medium text-muted-foreground">
										{t("sso.issuerUrl")}
									</span>
									<p className="break-all rounded-md bg-muted px-2 py-1.5 text-sm">
										{detailsProvider.issuer}
									</p>
								</div>
								<div className="grid gap-1">
									<span className="text-xs font-medium text-muted-foreground">
										{t("sso.domain")}
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
																{t("sso.clientId")}
															</span>
															<p className="rounded-md bg-muted px-2 py-1.5 font-mono text-sm">
																{oidc.clientId}
															</p>
														</div>
													)}
													{oidc.scopes && oidc.scopes.length > 0 && (
														<div className="grid gap-1">
															<span className="text-xs font-medium text-muted-foreground">
																{t("sso.scopes")}
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
														{t("sso.entryPoint")}
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
										{t("sso.callbackUrl")}
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
											{t("sso.callbackUrlHint", { baseURL: "{baseURL}" })}
										</p>
									)}
								</div>
							</div>
							<DialogFooter>
								<Button
									variant="outline"
									onClick={() => setDetailsProvider(null)}
								>
									{t("sso.close")}
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
							{t("sso.trustedOrigins")}
						</DialogTitle>
						<DialogDescription>
							{t("sso.trustedOriginsDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<span className="text-sm font-medium">
								{t("sso.currentOrigins")}
							</span>
							{trustedOrigins.length === 0 ? (
								<p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
									{t("sso.noOriginsYet")}
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
														{t("sso.save")}
													</Button>
													<Button
														size="sm"
														variant="ghost"
														onClick={handleCancelEdit}
													>
														{t("sso.cancel")}
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
														title={t("sso.removeOriginTitle")}
														description={t("sso.removeOriginDescription", {
															origin,
														})}
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
							<span className="text-sm font-medium">
								{t("sso.addTrustedOrigin")}
							</span>
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
									{t("sso.add")}
								</Button>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setManageOriginsOpen(false)}
						>
							{t("sso.close")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};
