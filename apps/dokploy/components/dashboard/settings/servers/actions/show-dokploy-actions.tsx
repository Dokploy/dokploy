import { Button } from "@/components/ui/button";
import React from "react";

import { UpdateServerIp } from "@/components/dashboard/settings/web-server/update-server-ip";
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
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { ShowModalLogs } from "../../web-server/show-modal-logs";
import { GPUSupportModal } from "../gpu-support-modal";
import { TerminalModal } from "../../web-server/terminal-modal";

export const ShowDokployActions = () => {
	const { t } = useTranslation("settings");
	const { mutateAsync: reloadServer, isLoading } =
		api.settings.reloadServer.useMutation();

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
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
