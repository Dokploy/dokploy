"use client";

import {
	Copy,
	Dices,
	HelpCircle,
	Loader2,
	ShieldCheck,
	ShieldOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

type ServerStatus = "running" | "stopped" | "unknown";
type Target = { serverId: string | null; name: string };
type CertType = "none" | "letsencrypt" | "custom";
type DomainForm = {
	host: string;
	https: boolean;
	certificateType: CertType;
	customCertResolver: string;
};

export const ForwardAuthServers = () => {
	const utils = api.useUtils();
	const [enabled, setEnabled] = useState(false);
	const [deployTarget, setDeployTarget] = useState<Target | null>(null);
	const [selectedProviderId, setSelectedProviderId] = useState("");
	const [forms, setForms] = useState<Record<string, DomainForm>>({});

	useEffect(() => {
		const id = setTimeout(() => setEnabled(true), 0);
		return () => clearTimeout(id);
	}, []);

	const { data: servers, isPending } = api.forwardAuth.serverStatus.useQuery(
		undefined,
		{ enabled, refetchOnWindowFocus: false, staleTime: 30_000 },
	);
	const { data: providers } = api.forwardAuth.listProviders.useQuery(
		undefined,
		{
			enabled: !!deployTarget,
		},
	);

	const { mutateAsync: saveAuthDomain, isPending: isSaving } =
		api.forwardAuth.setAuthDomain.useMutation();
	const { mutateAsync: deployOnServer, isPending: isDeploying } =
		api.forwardAuth.deployOnServer.useMutation();
	const { mutateAsync: removeOnServer, isPending: isRemoving } =
		api.forwardAuth.removeOnServer.useMutation();
	const { mutateAsync: generateDomain, isPending: isGenerating } =
		api.domain.generateDomain.useMutation();

	const keyOf = (serverId: string | null) => serverId ?? "local";

	useEffect(() => {
		if (!servers) return;
		setForms((prev) => {
			const next = { ...prev };
			for (const srv of servers) {
				const key = srv.serverId ?? "local";
				if (next[key] === undefined) {
					next[key] = {
						host: srv.authDomain ?? "",
						https: srv.https ?? true,
						certificateType: (srv.certificateType ?? "letsencrypt") as CertType,
						customCertResolver: srv.customCertResolver ?? "",
					};
				}
			}
			return next;
		});
	}, [servers]);

	const hasProviders = (providers?.length ?? 0) > 0;

	const patchForm = (serverId: string | null, patch: Partial<DomainForm>) =>
		setForms((p) => {
			const key = keyOf(serverId);
			const current: DomainForm = p[key] ?? {
				host: "",
				https: true,
				certificateType: "letsencrypt",
				customCertResolver: "",
			};
			return { ...p, [key]: { ...current, ...patch } };
		});

	const handleSaveDomain = async (serverId: string | null) => {
		const f = forms[keyOf(serverId)];
		if (!f?.host.trim()) {
			toast.error("Enter an auth domain first");
			return false;
		}
		if (f.certificateType === "custom" && !f.customCertResolver.trim()) {
			toast.error("Enter the custom certificate resolver");
			return false;
		}
		try {
			await saveAuthDomain({
				serverId,
				authDomain: f.host.trim(),
				https: f.https,
				certificateType: f.certificateType,
				customCertResolver: f.customCertResolver.trim() || undefined,
			});
			return true;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error saving auth domain",
			);
			return false;
		}
	};

	const handleDeploy = async () => {
		if (!deployTarget || !selectedProviderId) {
			toast.error("Select an SSO provider first");
			return;
		}
		try {
			const saved = await handleSaveDomain(deployTarget.serverId);
			if (!saved) return;
			await deployOnServer({
				serverId: deployTarget.serverId,
				providerId: selectedProviderId,
			});
			await utils.forwardAuth.serverStatus.invalidate();
			toast.success("Authentication proxy deployed");
			setDeployTarget(null);
			setSelectedProviderId("");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error deploying proxy",
			);
		}
	};

	const handleRemove = async (serverId: string | null) => {
		try {
			await removeOnServer({ serverId });
			await utils.forwardAuth.serverStatus.invalidate();
			toast.success("Authentication proxy removed");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error removing proxy",
			);
		}
	};

	const handleGenerateDomain = async (serverId: string | null) => {
		try {
			const host = await generateDomain({
				appName: "auth",
				serverId: serverId ?? undefined,
			});
			patchForm(serverId, { host, https: false, certificateType: "none" });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error generating domain",
			);
		}
	};

	const statusBadge = (status: ServerStatus) => {
		if (status === "running") {
			return (
				<Badge
					variant="outline"
					className="border-emerald-500/40 text-emerald-500"
				>
					<ShieldCheck className="mr-1 size-3" />
					Running
				</Badge>
			);
		}
		if (status === "stopped") {
			return (
				<Badge variant="secondary">
					<ShieldOff className="mr-1 size-3" />
					Not deployed
				</Badge>
			);
		}
		return (
			<Badge
				variant="outline"
				className="border-amber-500/40 text-amber-500"
				title="Could not reach this server in time"
			>
				<HelpCircle className="mr-1 size-3" />
				Unknown
			</Badge>
		);
	};

	return (
		<Card className="bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-xl">
					<ShieldCheck className="size-5" />
					Application Authentication
				</CardTitle>
				<CardDescription>
					Each server has its own authentication domain and proxy. Set an auth
					domain (e.g. auth.acme.com) per server, register its callback URL once
					in your identity provider, then deploy the proxy. Apps on that server
					under the same base domain are then one click to protect.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isPending || !enabled ? (
					<div className="flex items-center gap-2 justify-center py-6 text-muted-foreground">
						<Loader2 className="size-5 animate-spin" />
						<span className="text-sm">Checking servers...</span>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{servers?.map((srv) => {
							const key = keyOf(srv.serverId);
							const f = forms[key];
							return (
								<div
									key={key}
									className="flex flex-col gap-3 rounded-lg border p-4"
								>
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">{srv.name}</span>
										<div className="flex items-center gap-2">
											{statusBadge(srv.status)}
											{srv.status === "running" && (
												<DialogAction
													title="Remove authentication proxy"
													description="Domains on this server protected with SSO will stop requiring authentication until re-enabled. Continue?"
													type="destructive"
													onClick={() => handleRemove(srv.serverId)}
												>
													<Button
														variant="ghost"
														size="sm"
														isLoading={isRemoving}
													>
														Remove
													</Button>
												</DialogAction>
											)}
										</div>
									</div>

									<div className="grid gap-3 sm:grid-cols-2">
										<div className="flex flex-col gap-1">
											<span className="text-xs font-medium">Auth domain</span>
											<div className="flex gap-2">
												<Input
													placeholder="auth.acme.com"
													value={f?.host ?? ""}
													onChange={(e) =>
														patchForm(srv.serverId, { host: e.target.value })
													}
													className="font-mono text-sm"
												/>
												<Button
													type="button"
													variant="secondary"
													size="icon"
													isLoading={isGenerating}
													title="Generate sslip.io domain"
													onClick={() => handleGenerateDomain(srv.serverId)}
												>
													<Dices className="size-4 text-muted-foreground" />
												</Button>
											</div>
										</div>
										<div className="flex flex-col gap-1">
											<span className="text-xs font-medium">
												Certificate provider
											</span>
											<Select
												value={f?.https ? f.certificateType : "none"}
												onValueChange={(v) =>
													patchForm(srv.serverId, {
														certificateType: v as CertType,
														https: v !== "none",
													})
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select a certificate provider" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">None (HTTP)</SelectItem>
													<SelectItem value="letsencrypt">
														Let's Encrypt
													</SelectItem>
													<SelectItem value="custom">Custom</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>

									{f?.certificateType === "custom" && f?.https && (
										<div className="flex flex-col gap-1">
											<span className="text-xs font-medium">
												Custom certificate resolver
											</span>
											<Input
												placeholder="Enter your custom certificate resolver"
												value={f?.customCertResolver ?? ""}
												onChange={(e) =>
													patchForm(srv.serverId, {
														customCertResolver: e.target.value,
													})
												}
											/>
										</div>
									)}

									<div className="flex justify-end">
										<Button
											size="sm"
											disabled={!f?.host?.trim()}
											onClick={() =>
												setDeployTarget({
													serverId: srv.serverId,
													name: srv.name,
												})
											}
										>
											Deploy
										</Button>
									</div>

									{srv.callbackUrl && (
										<div className="flex flex-col gap-1">
											<span className="text-xs font-medium">
												Callback URL (register once in your IdP)
											</span>
											<div className="flex gap-2">
												<Input
													readOnly
													value={srv.callbackUrl}
													className="font-mono text-xs"
												/>
												<Button
													type="button"
													variant="outline"
													size="icon"
													onClick={() => {
														navigator.clipboard.writeText(
															srv.callbackUrl as string,
														);
														toast.success("Callback URL copied");
													}}
												>
													<Copy className="size-4" />
												</Button>
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</CardContent>

			<Dialog
				open={!!deployTarget}
				onOpenChange={(open) => {
					if (!open) {
						setDeployTarget(null);
						setSelectedProviderId("");
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Deploy authentication proxy</DialogTitle>
						<DialogDescription>
							Deploy the SSO proxy on{" "}
							<span className="font-medium">{deployTarget?.name}</span> using an
							OIDC provider.
						</DialogDescription>
					</DialogHeader>

					{!hasProviders && (
						<AlertBlock type="warning">
							No SSO providers configured. Add an OIDC provider above first.
						</AlertBlock>
					)}

					<div className="flex flex-col gap-2 py-2">
						<span className="text-sm font-medium">Identity provider</span>
						<Select
							value={selectedProviderId}
							onValueChange={setSelectedProviderId}
							disabled={!hasProviders}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select an SSO provider">
									{selectedProviderId || ""}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{providers?.map((provider) => (
									<SelectItem
										key={provider.providerId}
										value={provider.providerId}
									>
										<div className="flex flex-col">
											<span className="font-medium">{provider.providerId}</span>
											<span className="text-xs text-muted-foreground">
												{provider.issuer}
											</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<DialogFooter>
						<Button
							isLoading={isSaving || isDeploying}
							disabled={!hasProviders || !selectedProviderId}
							onClick={handleDeploy}
						>
							Deploy
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
};
