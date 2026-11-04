import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { ShowModalLogs } from "../../web-server/show-modal-logs";
import { SwitchWebServer } from "../../web-server/switch-web-server";

interface Props {
	serverId?: string;
}

export const ShowCaddyActions = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const { data: webServer } = api.settings.getWebServerProvider.useQuery({
		serverId,
	});
	const { mutateAsync: reload, isPending } =
		api.settings.reloadTraefik.useMutation();
	const syncError = webServer?.syncError;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={isPending}>
				<Button isLoading={isPending} variant="outline">
					{syncError && (
						<AlertTriangle className="size-4 text-destructive" aria-hidden />
					)}
					Caddy
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-72" align="start">
				{syncError && (
					<>
						<DropdownMenuLabel className="font-normal text-destructive">
							Caddy has not loaded the latest configuration. Changes saved since
							then are not live.
							<span className="block pt-1 font-mono text-xs break-words">
								{syncError}
							</span>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuLabel>Actions</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() =>
							reload({ serverId })
								.then(
									() => toast.success("Caddy Reloaded"),
									(error: Error) => toast.error(error.message),
								)
								.finally(() =>
									utils.settings.getWebServerProvider.invalidate({ serverId }),
								)
						}
					>
						<span>Reload</span>
					</DropdownMenuItem>
					<ShowModalLogs
						appName="dokploy-caddy"
						serverId={serverId}
						type="standalone"
					>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="cursor-pointer"
						>
							View Logs
						</DropdownMenuItem>
					</ShowModalLogs>
					<SwitchWebServer serverId={serverId} provider="caddy">
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="cursor-pointer"
						>
							<span>Switch to Traefik</span>
						</DropdownMenuItem>
					</SwitchWebServer>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
