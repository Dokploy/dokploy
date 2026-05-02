import { AlertCircle, Cloud, CloudOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, type RouterOutputs } from "@/utils/api";

type TunnelStatus = NonNullable<
	RouterOutputs["server"]["getTunnelStatus"]["tunnelStatus"]
>;

interface Props {
	serverId: string;
	initialStatus: TunnelStatus;
	initialError: string | null;
}

const VARIANTS: Record<
	TunnelStatus,
	{
		label: string;
		variant: "default" | "secondary" | "destructive" | "outline";
	}
> = {
	disabled: { label: "Tunnel: Off", variant: "outline" },
	provisioning: { label: "Tunnel: Provisioning", variant: "secondary" },
	installing: { label: "Tunnel: Installing", variant: "secondary" },
	registering: { label: "Tunnel: Registering", variant: "secondary" },
	healthy: { label: "Tunnel: Healthy", variant: "default" },
	error: { label: "Tunnel: Error", variant: "destructive" },
};

export const TunnelStatusBadge = ({
	serverId,
	initialStatus,
	initialError,
}: Props) => {
	const { data } = api.server.getTunnelStatus.useQuery(
		{ serverId },
		{
			enabled: !!serverId,
			refetchInterval: (query) => {
				const current = query.state.data?.tunnelStatus ?? initialStatus;
				return current === "provisioning" ||
					current === "installing" ||
					current === "registering"
					? 15_000
					: false;
			},
			initialData: {
				serverId,
				tunnelStatus: initialStatus,
				tunnelId: null,
				tunnelError: initialError,
				tunnelCheckedAt: null,
			},
		},
	);

	const status = data?.tunnelStatus ?? initialStatus;
	const error = data?.tunnelError ?? null;

	if (status === "disabled") {
		return null;
	}

	const v = VARIANTS[status];
	const isWorking =
		status === "provisioning" ||
		status === "installing" ||
		status === "registering";

	const badge = (
		<Badge variant={v.variant} className="cursor-help">
			{isWorking ? (
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
