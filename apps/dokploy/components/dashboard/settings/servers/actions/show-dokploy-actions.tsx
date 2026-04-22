import { toast } from "sonner";
import { UpdateServerIp } from "@/components/dashboard/settings/web-server/update-server-ip";
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
import { TerminalModal } from "../../web-server/terminal-modal";
import { GPUSupportModal } from "../gpu-support-modal";

export const ShowDokployActions = () => {
	const { mutateAsync: reloadServer, isPending } =
		api.settings.reloadServer.useMutation();

	const { mutateAsync: cleanRedis } = api.settings.cleanRedis.useMutation();
	const { mutateAsync: reloadRedis } = api.settings.reloadRedis.useMutation();
	const { mutateAsync: cleanAllDeploymentQueue } =
		api.settings.cleanAllDeploymentQueue.useMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={isPending}>
				<Button isLoading={isPending} variant="outline">
					Server
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="start">
				<DropdownMenuLabel>Actions</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={async () => {
							await reloadServer()
								.then(async () => {
									toast.success("Server Reloaded");
								})
								.catch(() => {
									toast.success("Server Reloaded");
								});
						}}
						className="cursor-pointer"
					>
						<span>Reload</span>
					</DropdownMenuItem>
					<TerminalModal serverId="local">
						<span>Terminal</span>
					</TerminalModal>
					<ShowModalLogs appName="dokploy">
						<DropdownMenuItem
							className="cursor-pointer"
							onSelect={(e) => e.preventDefault()}
						>
							View Logs
						</DropdownMenuItem>
					</ShowModalLogs>
					<GPUSupportModal />
					<UpdateServerIp>
						<DropdownMenuItem
							className="cursor-pointer"
							onSelect={(e) => e.preventDefault()}
						>
							Update Server IP
						</DropdownMenuItem>
					</UpdateServerIp>

					<DropdownMenuItem
						className="cursor-pointer"
						onClick={async () => {
							await cleanRedis()
								.then(async () => {
									toast.success("Redis cleaned");
								})
								.catch(() => {
									toast.error("Error cleaning Redis");
								});
						}}
					>
						Clean Redis
					</DropdownMenuItem>

					<DropdownMenuItem
						className="cursor-pointer"
						onClick={async () => {
							await cleanAllDeploymentQueue()
								.then(() => {
									toast.success("Deployment queue cleaned");
								})
								.catch(() => {
									toast.error("Error cleaning deployment queue");
								});
						}}
					>
						Clean all deployment queue
					</DropdownMenuItem>

					<DropdownMenuItem
						className="cursor-pointer"
						onClick={async () => {
							await reloadRedis()
								.then(async () => {
									toast.success("Redis reloaded");
								})
								.catch(() => {
									toast.error("Error reloading Redis");
								});
						}}
					>
						Reload Redis
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
