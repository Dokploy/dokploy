import {
	AlertCircle,
	CheckCircle2,
	ExternalLink,
	KeyRound,
	Pencil,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type RouterOutputs } from "@/utils/api";

type ConfigData = RouterOutputs["cloudflare"]["getConfig"];
type VerifyResult = RouterOutputs["cloudflare"]["verifyToken"];

interface Props {
	data: ConfigData | undefined;
	canCreate: boolean;
	canUpdate: boolean;
	canDelete: boolean;
}

const REQUIRED_PERMISSIONS = [
	"Account · Cloudflare Tunnel · Edit",
	"Zone · DNS · Edit",
	"Zone · Zone · Read",
	"Account · Account Settings · Read",
];

export const CloudflareConfigForm = ({
	data,
	canCreate,
	canUpdate,
	canDelete,
}: Props) => {
	const utils = api.useUtils();
	const [token, setToken] = useState("");
	const [editingToken, setEditingToken] = useState(false);
	const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
	const [verifiedToken, setVerifiedToken] = useState<string | null>(null);

	const resetTokenForm = () => {
		setToken("");
		setVerifyResult(null);
		setVerifiedToken(null);
		setEditingToken(false);
	};

	const invalidateConfigDependencies = async () => {
		await Promise.all([
			utils.cloudflare.getConfig.invalidate(),
			utils.cloudflare.listAvailableZones.invalidate(),
			utils.cloudflare.getLocalTunnelAccountChoice.invalidate(),
			utils.cloudflare.getServerTunnelAccountChoice.invalidate(),
		]);
	};

	const verifyMut = api.cloudflare.verifyToken.useMutation({
		onSuccess: (result, variables) => {
			setVerifyResult(result);
			setVerifiedToken(variables.apiToken);
		},
		onError: (error) => {
			setVerifyResult(null);
			setVerifiedToken(null);
			toast.error(error.message);
		},
	});
	const saveMut = api.cloudflare.saveToken.useMutation({
		onSuccess: async () => {
			toast.success(
				data?.config ? "Cloudflare token updated" : "Cloudflare connected",
			);
			resetTokenForm();
			await invalidateConfigDependencies();
		},
		onError: (error) => toast.error(error.message),
	});
	const deleteMut = api.cloudflare.deleteConfig.useMutation({
		onSuccess: async () => {
			toast.success("Cloudflare disconnected");
			resetTokenForm();
			await invalidateConfigDependencies();
		},
		onError: (error) => toast.error(error.message),
	});

	const hasConfig = !!data?.config;
	const hasAccessibleAccounts = (data?.config?.accounts.length ?? 0) > 0;
	const normalizedToken = token.trim();
	const canEditToken = hasConfig ? canUpdate : canCreate;
	const showTokenForm = !hasConfig || editingToken;
	const tokenIsVerified =
		!!normalizedToken &&
		verifiedToken === normalizedToken &&
		verifyResult?.ok === true &&
		verifyResult.accounts.length > 0;

	const handleTokenChange = (nextToken: string) => {
		setToken(nextToken);
		setVerifyResult(null);
		setVerifiedToken(null);
	};

	return (
		<Card>
			<CardHeader className="has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
				<CardTitle className="flex items-center gap-2">
					<KeyRound className="size-5 text-muted-foreground" />
					Cloudflare connection
				</CardTitle>
				<CardDescription>
					Connect an API token so Dokploy can manage tunnels and DNS records for
					this organization.
				</CardDescription>
				{hasConfig ? (
					<CardAction className="col-start-1 row-start-3 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
						<Badge
							variant={hasAccessibleAccounts ? "secondary" : "destructive"}
							className={
								hasAccessibleAccounts ? "gap-1.5 text-green-600" : "gap-1.5"
							}
						>
							{hasAccessibleAccounts ? (
								<CheckCircle2 className="size-3.5" />
							) : (
								<AlertCircle className="size-3.5" />
							)}
							{hasAccessibleAccounts ? "Connected" : "Needs attention"}
						</Badge>
					</CardAction>
				) : null}
			</CardHeader>
			<CardContent className="flex flex-col gap-5">
				{hasConfig ? (
					<div className="space-y-3">
						{!hasAccessibleAccounts ? (
							<AlertBlock type="warning">
								The saved token cannot access any Cloudflare accounts. Replace
								it before managing zones or tunnels.
							</AlertBlock>
						) : null}
						<div className="rounded-lg border bg-muted/20 p-4">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
								<div className="min-w-0 space-y-2">
									<p className="text-sm font-medium">
										{data.config?.accounts.length === 1
											? "1 accessible account"
											: `${data.config?.accounts.length ?? 0} accessible accounts`}
									</p>
									<div className="flex flex-wrap gap-2">
										{(data.config?.accounts ?? []).map((account) => (
											<Badge
												key={account.id}
												variant="outline"
												className="max-w-full gap-1.5 font-normal"
											>
												<span className="truncate">{account.name}</span>
												<span className="font-mono text-muted-foreground">
													{account.id.slice(0, 8)}…
												</span>
											</Badge>
										))}
									</div>
									{data.config?.verifiedAt ? (
										<p className="text-xs text-muted-foreground">
											Last verified{" "}
											{new Date(data.config.verifiedAt).toLocaleString()}
										</p>
									) : null}
								</div>
								{canUpdate || canDelete ? (
									<div className="flex shrink-0 flex-wrap gap-2">
										{canUpdate ? (
											<Button
												variant="outline"
												size="sm"
												onClick={() => setEditingToken((current) => !current)}
											>
												<Pencil className="size-4" />
												{editingToken ? "Cancel" : "Replace token"}
											</Button>
										) : null}
										{canDelete ? (
											<DialogAction
												title="Disconnect Cloudflare?"
												description="This removes the saved token and configured zones from Dokploy. Existing DNS records and tunnels in Cloudflare are not deleted, but Dokploy will stop managing them. Remove managed domains and disable tunnels first if you also want those resources cleaned up."
												onClick={() => deleteMut.mutate()}
												disabled={deleteMut.isPending}
											>
												<Button
													variant="destructive"
													size="sm"
													isLoading={deleteMut.isPending}
												>
													{!deleteMut.isPending ? (
														<Trash2 className="size-4" />
													) : null}
													Disconnect
												</Button>
											</DialogAction>
										) : null}
									</div>
								) : null}
							</div>
						</div>
					</div>
				) : null}

				{!hasConfig && !canCreate ? (
					<AlertBlock type="info">
						Cloudflare is not connected. Ask an organization administrator with
						Cloudflare create access to configure it.
					</AlertBlock>
				) : null}

				{showTokenForm && canEditToken ? (
					<div className="flex flex-col gap-4 border-t pt-5">
						<div className="space-y-1">
							<p className="text-sm font-medium">
								{hasConfig ? "Replace API token" : "Connect Cloudflare"}
							</p>
							<p className="text-xs text-muted-foreground">
								The token is verified before it can be saved. Replacing it does
								not recreate existing zones or tunnels.
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="cf-token">API token</Label>
							<Input
								id="cf-token"
								type="password"
								autoComplete="off"
								spellCheck={false}
								placeholder="Paste your Cloudflare API token"
								value={token}
								onChange={(event) => handleTokenChange(event.target.value)}
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								onClick={() => verifyMut.mutate({ apiToken: normalizedToken })}
								disabled={!normalizedToken || saveMut.isPending}
								isLoading={verifyMut.isPending}
							>
								Verify token
							</Button>
							<Button
								onClick={() => saveMut.mutate({ apiToken: normalizedToken })}
								disabled={!tokenIsVerified || verifyMut.isPending}
								isLoading={saveMut.isPending}
							>
								{hasConfig ? "Save new token" : "Connect Cloudflare"}
							</Button>
						</div>

						{verifyResult ? (
							verifyResult.ok && verifyResult.accounts.length > 0 ? (
								<AlertBlock type="success">
									<p className="font-medium">
										Token verified · {verifyResult.accounts.length}{" "}
										{verifyResult.accounts.length === 1
											? "account"
											: "accounts"}
									</p>
									<ul className="mt-1 list-disc pl-4 text-xs">
										{verifyResult.accounts.map((account) => (
											<li key={account.id}>
												{account.name}{" "}
												<span className="font-mono opacity-75">
													({account.id.slice(0, 8)}…)
												</span>
											</li>
										))}
									</ul>
								</AlertBlock>
							) : verifyResult.ok ? (
								<AlertBlock type="warning">
									The token is active, but it cannot access any accounts. Check
									its Account Settings read permission and account resource
									scope.
								</AlertBlock>
							) : (
								<AlertBlock type="error">
									Token verification failed (status: {verifyResult.status}).
								</AlertBlock>
							)
						) : null}

						<div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
							<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
								<p className="font-medium text-foreground">
									Required token permissions
								</p>
								<a
									href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/"
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-primary hover:underline"
								>
									Cloudflare guide
									<ExternalLink className="size-3" />
								</a>
							</div>
							<ul className="grid list-disc gap-1 pl-4 sm:grid-cols-2">
								{REQUIRED_PERMISSIONS.map((permission) => (
									<li key={permission}>{permission}</li>
								))}
							</ul>
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
};
