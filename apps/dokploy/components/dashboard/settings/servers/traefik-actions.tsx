import { api } from "@/utils/api";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ShowModalLogs } from "../web-server/show-modal-logs";
import { DockerTerminalModal } from "../web-server/docker-terminal-modal";
import { EditTraefikEnv } from "../web-server/edit-traefik-env";
import { ShowMainTraefikConfig } from "../web-server/show-main-traefik-config";

interface Props {
	serverId?: string;
}
export const TraefikActions = ({ serverId }: Props) => {
	api.settings.reloadServer.useMutation();
	const { mutateAsync: reloadTraefik, isLoading: reloadTraefikIsLoading } =
		api.settings.reloadTraefik.useMutation();
	const { mutateAsync: cleanAll, isLoading: cleanAllIsLoading } =
		api.settings.cleanAll.useMutation();
	const { mutateAsync: toggleDashboard, isLoading: toggleDashboardIsLoading } =
		api.settings.toggleDashboard.useMutation();

	const {
		mutateAsync: cleanStoppedContainers,
		isLoading: cleanStoppedContainersIsLoading,
	} = api.settings.cleanStoppedContainers.useMutation();

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();

	const { mutateAsync: updateDockerCleanup } =
		api.settings.updateDockerCleanup.useMutation();

	const { data: haveTraefikDashboardPortEnabled, refetch: refetchDashboard } =
		api.settings.haveTraefikDashboardPortEnabled.useQuery();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				asChild
				disabled={reloadTraefikIsLoading || toggleDashboardIsLoading}
			>
				<Button
					isLoading={reloadTraefikIsLoading || toggleDashboardIsLoading}
					variant="outline"
				>
					Traefik
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="start">
				<DropdownMenuLabel>Actions</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={async () => {
							await reloadTraefik({
								serverId: serverId,
							})
								.then(async () => {
									toast.success("Traefik Reloaded");
								})
								.catch(() => {
									toast.error("Error to reload the traefik");
								});
						}}
					>
						<span>Reload</span>
					</DropdownMenuItem>
					<ShowModalLogs appName="dokploy-traefik">
						<span>Watch logs</span>
					</ShowModalLogs>
					{!serverId && (
						<ShowMainTraefikConfig>
							<DropdownMenuItem
								onSelect={(e) => e.preventDefault()}
								className="w-full cursor-pointer space-x-3"
							>
								<span>View Traefik config</span>
							</DropdownMenuItem>
						</ShowMainTraefikConfig>
					)}

					<EditTraefikEnv serverId={serverId}>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="w-full cursor-pointer space-x-3"
						>
							<span>Modify Env</span>
						</DropdownMenuItem>
					</EditTraefikEnv>

					<DropdownMenuItem
						onClick={async () => {
							await toggleDashboard({
								enableDashboard: !haveTraefikDashboardPortEnabled,
								serverId: serverId,
							})
								.then(async () => {
									toast.success(
										`${haveTraefikDashboardPortEnabled ? "Disabled" : "Enabled"} Dashboard`,
									);
									refetchDashboard();
								})
								.catch(() => {
									toast.error(
										`${haveTraefikDashboardPortEnabled ? "Disabled" : "Enabled"} Dashboard`,
									);
								});
						}}
						className="w-full cursor-pointer space-x-3"
					>
						<span>
							{haveTraefikDashboardPortEnabled ? "Disable" : "Enable"} Dashboard
						</span>
					</DropdownMenuItem>

					<DockerTerminalModal appName="dokploy-traefik" serverId={serverId}>
						<DropdownMenuItem
							className="w-full cursor-pointer space-x-3"
							onSelect={(e) => e.preventDefault()}
						>
							<span>Enter the terminal</span>
						</DropdownMenuItem>
					</DockerTerminalModal>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
