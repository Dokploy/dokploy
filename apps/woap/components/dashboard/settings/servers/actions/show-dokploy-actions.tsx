import { useTranslation } from "next-i18next";
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
	const { t } = useTranslation("settings");
	const { mutateAsync: reloadServer, isLoading } =
		api.settings.reloadServer.useMutation();

	const { mutateAsync: cleanRedis } = api.settings.cleanRedis.useMutation();
	const { mutateAsync: reloadRedis } = api.settings.reloadRedis.useMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={isLoading}>
				<Button isLoading={isLoading} variant="outline">
					{t("settings.server.webServer.server.label")}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="start">
				<DropdownMenuLabel>
					{t("settings.server.webServer.actions")}
				</DropdownMenuLabel>
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
						<span>{t("settings.server.webServer.reload")}</span>
					</DropdownMenuItem>
					<TerminalModal serverId="local">
						<span>{t("settings.common.enterTerminal")}</span>
					</TerminalModal>
					<ShowModalLogs appName="dokploy">
						<DropdownMenuItem
							className="cursor-pointer"
							onSelect={(e) => e.preventDefault()}
						>
							{t("settings.server.webServer.watchLogs")}
						</DropdownMenuItem>
					</ShowModalLogs>
					<GPUSupportModal />
					<UpdateServerIp>
						<DropdownMenuItem
							className="cursor-pointer"
							onSelect={(e) => e.preventDefault()}
						>
							{t("settings.server.webServer.updateServerIp")}
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
