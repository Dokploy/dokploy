import {
	AlertCircle,
	Cloud,
	CloudOff,
	Loader2,
	RefreshCw,
	ServerCog,
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, type RouterOutputs } from "@/utils/api";

type LocalTunnel = NonNullable<RouterOutputs["cloudflare"]["getLocalTunnel"]>;
type TunnelStatus = LocalTunnel["tunnelStatus"];

interface Props {
	canUpdate: boolean;
}

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
	error: { label: "Needs attention", variant: "destructive" },
};

const WORKING_STATUSES: TunnelStatus[] = [
	"provisioning",
	"installing",
	"registering",
];

const StatusBadge = ({
	status,
	error,
}: {
	status: TunnelStatus;
	error: string | null;
}) => {
	const statusConfig = VARIANTS[status];
	const working = WORKING_STATUSES.includes(status);
	const badge = (
		<Badge variant={statusConfig.variant} className="gap-1.5">
			{working ? (
				<Loader2 className="size-3 animate-spin" />
			) : status === "error" ? (
				<AlertCircle className="size-3" />
			) : status === "healthy" ? (
				<Cloud className="size-3" />
			) : (
				<CloudOff className="size-3" />
			)}
			{statusConfig.label}
		</Badge>
	);

	if (status === "error" && error) {
		return (
			<Tooltip delayDuration={0}>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={`Local tunnel error: ${error}`}
						className="inline-flex"
					>
						{badge}
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					<p className="break-words text-sm">{error}</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	return badge;
};

export const LocalTunnelSection = ({ canUpdate }: Props) => {
	const utils = api.useUtils();
	const [pickedAccount, setPickedAccount] = useState<string | null>(null);

	const invalidateLocalTunnel = async () => {
		await Promise.all([
			utils.cloudflare.getLocalTunnel.invalidate(),
			utils.cloudflare.getLocalTunnelAccountChoice.invalidate(),
		]);
	};

	const provision = api.cloudflare.provisionLocalTunnel.useMutation({
		onSuccess: async () => {
			toast.success("Local tunnel is ready");
			await invalidateLocalTunnel();
		},
		onError: async (error) => {
			toast.error(error.message);
			await invalidateLocalTunnel();
		},
	});
	const deprovision = api.cloudflare.deprovisionLocalTunnel.useMutation({
		onSuccess: async () => {
			toast.success("Local tunnel disabled");
			setPickedAccount(null);
			await invalidateLocalTunnel();
		},
		onError: async (error) => {
			toast.error(error.message);
			await invalidateLocalTunnel();
		},
	});
	const pushMutation = api.cloudflare.pushLocalTunnelToCloudflare.useMutation({
		onSuccess: () => toast.success("Tunnel routes pushed to Cloudflare"),
		onError: (error) => toast.error(error.message),
	});

	const localQuery = api.cloudflare.getLocalTunnel.useQuery(undefined, {
		refetchInterval: (query) => {
			const currentStatus = query.state.data?.tunnelStatus;
			return provision.isPending ||
				(currentStatus && WORKING_STATUSES.includes(currentStatus))
				? 2_000
				: false;
		},
	});
	const choiceQuery = api.cloudflare.getLocalTunnelAccountChoice.useQuery();

	const local = localQuery.data;
	const status = local?.tunnelStatus ?? "disabled";
	const accountId = local?.tunnelAccountId ?? null;
	const accounts = choiceQuery.data?.accounts ?? [];
	const accountName = accountId
		? (accounts.find((account) => account.id === accountId)?.name ?? accountId)
		: null;
	const derivedAccount = choiceQuery.data?.candidate
		? accounts.find((account) => account.id === choiceQuery.data?.candidate)
		: null;
	const isWorkingStatus = WORKING_STATUSES.includes(status);
	const isMutating = provision.isPending || deprovision.isPending;
	const hasAccounts = accounts.length > 0;
	const ambiguousNoChoice = !!choiceQuery.data?.ambiguous && !pickedAccount;
	const setupUnavailable =
		localQuery.isPending ||
		choiceQuery.isPending ||
		!!localQuery.error ||
		!!choiceQuery.error ||
		!hasAccounts ||
		ambiguousNoChoice ||
		isWorkingStatus ||
		isMutating;

	const onProvision = () => {
		const explicitAccount =
			pickedAccount ?? choiceQuery.data?.candidate ?? undefined;
		provision.mutate({ tunnelAccountId: explicitAccount });
	};

	return (
		<Card>
			<CardHeader className="has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
				<CardTitle className="flex items-center gap-2">
					<ServerCog className="size-5 text-muted-foreground" />
					Local tunnel
				</CardTitle>
				<CardDescription>
					Run a Dokploy-managed tunnel on this panel host for services that do
					not use a remote server. It coexists with manually managed cloudflared
					services.
				</CardDescription>
				<CardAction className="col-start-1 row-start-3 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
					<StatusBadge status={status} error={local?.tunnelError ?? null} />
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{localQuery.isPending || choiceQuery.isPending ? (
					<div className="grid gap-3 sm:grid-cols-2">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-16 w-full" />
					</div>
				) : localQuery.error || choiceQuery.error ? (
					<AlertBlock type="error">
						<div className="flex flex-col items-start gap-2">
							<div>
								<p className="font-medium">
									Local tunnel status could not be loaded.
								</p>
								<p className="text-xs">
									{localQuery.error?.message ?? choiceQuery.error?.message}
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									localQuery.refetch();
									choiceQuery.refetch();
								}}
							>
								Try again
							</Button>
						</div>
					</AlertBlock>
				) : (
					<>
						{status === "error" && local?.tunnelError ? (
							<AlertBlock type="error">
								<p className="font-medium">Local tunnel setup failed.</p>
								<p className="text-xs">{local.tunnelError}</p>
							</AlertBlock>
						) : null}
						{!hasAccounts ? (
							<AlertBlock type="warning">
								The saved token cannot access a Cloudflare account. Replace the
								token before setting up this tunnel.
							</AlertBlock>
						) : null}

						{status === "disabled" || !local?.tunnelId ? (
							<div className="flex flex-col gap-4">
								{choiceQuery.data?.ambiguous ? (
									<div className="flex max-w-lg flex-col gap-2">
										<label
											className="text-sm font-medium"
											htmlFor="local-tunnel-account"
										>
											Cloudflare account
										</label>
										<Select
											value={pickedAccount ?? ""}
											onValueChange={(value) => setPickedAccount(value || null)}
											disabled={!canUpdate || isMutating || isWorkingStatus}
										>
											<SelectTrigger
												id="local-tunnel-account"
												className="w-full"
											>
												<SelectValue placeholder="Select an account" />
											</SelectTrigger>
											<SelectContent>
												{accounts.map((account) => (
													<SelectItem key={account.id} value={account.id}>
														{account.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<p className="text-xs text-muted-foreground">
											Your enabled zones span multiple accounts. The tunnel and
											the zones it serves must belong to the same account.
										</p>
									</div>
								) : derivedAccount ? (
									<div className="rounded-lg border bg-muted/20 p-3 text-sm">
										<p className="text-xs text-muted-foreground">
											Tunnel account
										</p>
										<p className="font-medium">{derivedAccount.name}</p>
									</div>
								) : null}

								{isWorkingStatus ? (
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<Loader2 className="size-4 animate-spin" />
										Tunnel setup is in progress. This can take about a minute.
									</div>
								) : canUpdate ? (
									<Button
										className="w-fit"
										onClick={onProvision}
										disabled={setupUnavailable}
										isLoading={provision.isPending}
									>
										{status === "error" ? "Retry setup" : "Set up local tunnel"}
									</Button>
								) : (
									<p className="text-sm text-muted-foreground">
										You have read-only access to this tunnel.
									</p>
								)}
							</div>
						) : (
							<div className="flex flex-col gap-4">
								<dl className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2">
									<div className="min-w-0">
										<dt className="text-xs text-muted-foreground">Tunnel ID</dt>
										<dd className="break-all font-mono">{local.tunnelId}</dd>
									</div>
									<div className="min-w-0">
										<dt className="text-xs text-muted-foreground">Account</dt>
										<dd className="break-words font-medium">
											{accountName ?? "—"}
										</dd>
									</div>
									{local.tunnelCheckedAt ? (
										<div className="sm:col-span-2">
											<dt className="text-xs text-muted-foreground">
												Last update
											</dt>
											<dd>
												{new Date(local.tunnelCheckedAt).toLocaleString()}
											</dd>
										</div>
									) : null}
								</dl>

								{isWorkingStatus ? (
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<Loader2 className="size-4 animate-spin" />
										Tunnel setup is in progress. Actions will be available when
										it finishes.
									</div>
								) : canUpdate ? (
									<div className="flex flex-wrap items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => pushMutation.mutate()}
											disabled={isMutating || pushMutation.isPending}
											isLoading={pushMutation.isPending}
										>
											{!pushMutation.isPending ? (
												<RefreshCw className="size-4" />
											) : null}
											Push routes
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={onProvision}
											disabled={isMutating || pushMutation.isPending}
											isLoading={provision.isPending}
										>
											Reinstall connector
										</Button>
										<DialogAction
											title="Disable local tunnel?"
											description="The Dokploy cloudflared container and its Cloudflare tunnel are removed. Domains attached to services on this panel host will stop resolving through this tunnel."
											onClick={() => deprovision.mutate()}
											disabled={isMutating || pushMutation.isPending}
										>
											<Button
												variant="destructive"
												size="sm"
												disabled={isMutating || pushMutation.isPending}
												isLoading={deprovision.isPending}
											>
												Disable tunnel
											</Button>
										</DialogAction>
									</div>
								) : (
									<p className="text-sm text-muted-foreground">
										You have read-only access to this tunnel.
									</p>
								)}
								<p className="text-xs text-muted-foreground">
									Push routes sends Dokploy's current local-domain configuration
									to Cloudflare. It does not import changes made in Cloudflare.
								</p>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
};
