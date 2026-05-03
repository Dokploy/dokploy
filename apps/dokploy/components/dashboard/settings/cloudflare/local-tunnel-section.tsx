import { AlertCircle, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, type RouterOutputs } from "@/utils/api";

type LocalTunnel = NonNullable<RouterOutputs["cloudflare"]["getLocalTunnel"]>;
type TunnelStatus = LocalTunnel["tunnelStatus"];

const VARIANTS: Record<
	TunnelStatus,
	{
		label: string;
		variant: "default" | "secondary" | "destructive" | "outline";
	}
> = {
	disabled: { label: "Not configured", variant: "outline" },
	provisioning: { label: "Provisioning", variant: "secondary" },
	installing: { label: "Installing", variant: "secondary" },
	registering: { label: "Registering", variant: "secondary" },
	healthy: { label: "Healthy", variant: "default" },
	error: { label: "Error", variant: "destructive" },
};

const StatusBadge = ({
	status,
	error,
}: {
	status: TunnelStatus;
	error: string | null;
}) => {
	const v = VARIANTS[status];
	const working =
		status === "provisioning" ||
		status === "installing" ||
		status === "registering";
	const badge = (
		<Badge variant={v.variant} className="cursor-help">
			{working ? (
				<Loader2 className="h-3 w-3 mr-1 animate-spin" />
			) : status === "error" ? (
				<AlertCircle className="h-3 w-3 mr-1" />
			) : status === "healthy" ? (
				<Cloud className="h-3 w-3 mr-1" />
			) : (
				<CloudOff className="h-3 w-3 mr-1" />
			)}
			{v.label}
		</Badge>
	);
	if (status === "error" && error) {
		return (
			<Tooltip delayDuration={0}>
				<TooltipTrigger asChild>
					<span>{badge}</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					<p className="text-sm break-words">{error}</p>
				</TooltipContent>
			</Tooltip>
		);
	}
	return badge;
};

export const LocalTunnelSection = () => {
	const utils = api.useUtils();
	const cfgQ = api.cloudflare.getConfig.useQuery();
	const localQ = api.cloudflare.getLocalTunnel.useQuery(undefined, {
		refetchInterval: (query) => {
			const s = query.state.data?.tunnelStatus;
			return s === "provisioning" || s === "installing" || s === "registering"
				? 5_000
				: false;
		},
	});
	const choiceQ = api.cloudflare.getLocalTunnelAccountChoice.useQuery();
	const [pickedAccount, setPickedAccount] = useState<string | null>(null);

	const provision = api.cloudflare.provisionLocalTunnel.useMutation({
		onSuccess: () => {
			toast.success("Local tunnel provisioned");
			utils.cloudflare.getLocalTunnel.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});
	const deprov = api.cloudflare.deprovisionLocalTunnel.useMutation({
		onSuccess: () => {
			toast.success("Local tunnel disabled");
			utils.cloudflare.getLocalTunnel.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});
	const pushMut = api.cloudflare.pushLocalTunnelToCloudflare.useMutation({
		onSuccess: () => toast.success("Local tunnel pushed to Cloudflare"),
		onError: (e) => toast.error(e.message),
	});

	if (!cfgQ.data?.config) return null;

	const local = localQ.data;
	const status = local?.tunnelStatus ?? "disabled";
	const accountId = local?.tunnelAccountId ?? null;
	const accounts = choiceQ.data?.accounts ?? [];
	const accountName = accountId
		? (accounts.find((a) => a.id === accountId)?.name ?? accountId)
		: null;

	const isPending = provision.isPending || deprov.isPending;
	const ambiguousNoChoice = !!choiceQ.data?.ambiguous && !pickedAccount;

	const onProvision = () => {
		const explicit = pickedAccount ?? choiceQ.data?.candidate ?? undefined;
		provision.mutate({ tunnelAccountId: explicit ?? undefined });
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-3">
				<div>
					<CardTitle className="flex items-center gap-2">
						Local Tunnel
						<StatusBadge status={status} error={local?.tunnelError ?? null} />
					</CardTitle>
					<CardDescription>
						Run a Cloudflare tunnel directly on this Dokploy panel host so
						services without a Remote Server can use Cloudflare-managed domains.
						Coexists with any manual <code>cloudflared.service</code>
						you already run.
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{status === "disabled" || !local?.tunnelId ? (
					<div className="flex flex-col gap-3">
						{choiceQ.data?.ambiguous && (
							<div className="flex flex-col gap-2">
								<label
									className="text-sm font-medium"
									htmlFor="local-tunnel-account"
								>
									Cloudflare account
								</label>
								<Select
									value={pickedAccount ?? ""}
									onValueChange={(v) => setPickedAccount(v || null)}
								>
									<SelectTrigger
										id="local-tunnel-account"
										className="w-full max-w-md"
									>
										<SelectValue placeholder="Pick a Cloudflare account" />
									</SelectTrigger>
									<SelectContent>
										{accounts.map((a) => (
											<SelectItem key={a.id} value={a.id}>
												{a.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									Multiple accounts are accessible with this token. Pick the one
									that owns the zones you want to route through this panel host.
								</p>
							</div>
						)}
						<div className="flex items-center gap-2">
							<Button
								onClick={onProvision}
								disabled={isPending || ambiguousNoChoice}
							>
								{provision.isPending ? (
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								) : null}
								Setup Local Tunnel
							</Button>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
							<div>
								<dt className="text-muted-foreground">Tunnel ID</dt>
								<dd className="font-mono break-all">{local.tunnelId}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Account</dt>
								<dd className="font-mono break-all">{accountName ?? "—"}</dd>
							</div>
						</dl>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => pushMut.mutate()}
								disabled={pushMut.isPending}
							>
								<RefreshCw className="h-4 w-4 mr-1" />
								Push to Cloudflare
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={onProvision}
								disabled={isPending}
							>
								Reinstall
							</Button>
							<DialogAction
								title="Disable local tunnel?"
								description="The cloudflared container is removed and the tunnel is deleted in Cloudflare. Domains attached to panel-host services will stop resolving until a new tunnel is provisioned."
								onClick={() => deprov.mutate()}
							>
								<Button variant="destructive" size="sm" disabled={isPending}>
									Disable
								</Button>
							</DialogAction>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
