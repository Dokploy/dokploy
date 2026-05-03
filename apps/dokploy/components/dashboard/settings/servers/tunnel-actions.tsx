import { CloudOff, Loader2, RefreshCcw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";

interface Props {
	serverId: string;
	tunnelStatus:
		| "disabled"
		| "provisioning"
		| "installing"
		| "registering"
		| "healthy"
		| "error";
}

export const TunnelActions = ({ serverId, tunnelStatus }: Props) => {
	const utils = api.useUtils();
	const setupMut = api.server.setupTunnel.useMutation({
		onSuccess: () => {
			toast.success("Tunnel setup started");
			utils.server.getTunnelStatus.invalidate({ serverId });
			utils.server.all.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});
	const disableMut = api.server.disableTunnel.useMutation({
		onSuccess: () => {
			toast.success("Tunnel disabled");
			utils.server.getTunnelStatus.invalidate({ serverId });
			utils.server.all.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});
	const pushMut = api.server.pushTunnelToCloudflare.useMutation({
		onSuccess: () => {
			toast.success("Pushed to Cloudflare");
			utils.server.getTunnelStatus.invalidate({ serverId });
		},
		onError: (e) => toast.error(e.message),
	});

	const isWorking =
		setupMut.isPending || disableMut.isPending || pushMut.isPending;

	return (
		<>
			<DropdownMenuItem
				onClick={(e) => {
					e.preventDefault();
					setupMut.mutate({ serverId });
				}}
				disabled={isWorking}
			>
				{setupMut.isPending ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Wrench className="h-4 w-4" />
				)}
				{tunnelStatus === "disabled" ? "Enable Tunnel" : "Reinstall Tunnel"}
			</DropdownMenuItem>
			{tunnelStatus !== "disabled" && (
				<DropdownMenuItem
					onClick={(e) => {
						e.preventDefault();
						pushMut.mutate({ serverId });
					}}
					disabled={isWorking}
				>
					{pushMut.isPending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<RefreshCcw className="h-4 w-4" />
					)}
					Push to Cloudflare
				</DropdownMenuItem>
			)}
			{tunnelStatus !== "disabled" && (
				<DropdownMenuItem
					onClick={(e) => {
						e.preventDefault();
						disableMut.mutate({ serverId });
					}}
					disabled={isWorking}
				>
					{disableMut.isPending ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<CloudOff className="h-4 w-4" />
					)}
					Disable Tunnel
				</DropdownMenuItem>
			)}
		</>
	);
};
