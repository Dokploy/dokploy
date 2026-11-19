import { useTranslation } from "react-i18next";
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
import { TogglePanelPort } from "../../web-server/toggle-panel-port";
import { GPUSupportModal } from "../gpu-support-modal";

export const ShowDokployActions = () => {
	const { t } = useTranslation();
	const { mutateAsync: reloadServer, isPending } =
		api.settings.reloadServer.useMutation();

	const { mutateAsync: cleanAllDeploymentQueue } =
		api.settings.cleanAllDeploymentQueue.useMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={isPending}>
				<Button isLoading={isPending} variant="outline">
					{t("settings.servers.dokployActions.server")}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="start">
				<DropdownMenuLabel>
					{t("settings.servers.dokployActions.actions")}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						onClick={async () => {
							await reloadServer()
								.then(async () => {
									toast.success(
										t("settings.servers.dokployActions.serverReloaded"),
									);
								})
								.catch(() => {
									toast.success(
										t("settings.servers.dokployActions.serverReloaded"),
									);
								});
						}}
						className="cursor-pointer"
					>
						<span>{t("settings.servers.dokployActions.reload")}</span>
					</DropdownMenuItem>
					<TerminalModal serverId="local">
						<span>{t("settings.servers.dokployActions.terminal")}</span>
					</TerminalModal>
					<ShowModalLogs appName="dokploy">
						<DropdownMenuItem
							className="cursor-pointer"
							onSelect={(e) => e.preventDefault()}
						>
							{t("settings.servers.dokployActions.viewLogs")}
						</DropdownMenuItem>
					</ShowModalLogs>
					<GPUSupportModal />
					<UpdateServerIp>
						<DropdownMenuItem
							className="cursor-pointer"
							onSelect={(e) => e.preventDefault()}
						>
							{t("settings.servers.dokployActions.updateServerIp")}
						</DropdownMenuItem>
					</UpdateServerIp>
					<TogglePanelPort />

					<DropdownMenuItem
						className="cursor-pointer"
						onClick={async () => {
							await cleanAllDeploymentQueue()
								.then(() => {
									toast.success(
										t("settings.servers.dokployActions.queueCleaned"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.servers.dokployActions.queueCleanError"),
									);
								});
						}}
					>
						{t("settings.servers.dokployActions.cleanQueue")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
