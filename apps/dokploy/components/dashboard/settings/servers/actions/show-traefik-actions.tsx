import { useTranslation } from "next-i18next";
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
import { EditTraefikEnv } from "../../web-server/edit-traefik-env";
import { ManageTraefikPorts } from "../../web-server/manage-traefik-ports";
import { ShowModalLogs } from "../../web-server/show-modal-logs";

interface Props {
	serverId?: string;
}
export const ShowTraefikActions = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const { mutateAsync: reloadTraefik, isLoading: reloadTraefikIsLoading } =
		api.settings.reloadTraefik.useMutation();

	const { mutateAsync: toggleDashboard, isLoading: toggleDashboardIsLoading } =
		api.settings.toggleDashboard.useMutation();

	const { data: haveTraefikDashboardPortEnabled, refetch: refetchDashboard } =
		api.settings.haveTraefikDashboardPortEnabled.useQuery({
			serverId,
		});

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
					{t("settings.server.webServer.traefik.label")}
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
							await reloadTraefik({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(t("settings.traefik.reloaded"));
								})
								.catch(() => {});
						}}
						className="cursor-pointer"
					>
						<span>{t("settings.server.webServer.reload")}</span>
					</DropdownMenuItem>
					<ShowModalLogs
						appName="dokploy-traefik"
						serverId={serverId}
						type="standalone"
					>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="cursor-pointer"
						>
							{t("settings.server.webServer.watchLogs")}
						</DropdownMenuItem>
					</ShowModalLogs>
					<EditTraefikEnv serverId={serverId}>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="cursor-pointer"
						>
							<span>{t("settings.server.webServer.traefik.modifyEnv")}</span>
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
										haveTraefikDashboardPortEnabled
											? t("settings.traefik.dashboardDisabled")
											: t("settings.traefik.dashboardEnabled"),
									);
									refetchDashboard();
								})
								.catch(() => {
									toast.error(
										haveTraefikDashboardPortEnabled
											? t("settings.traefik.dashboardDisableError")
											: t("settings.traefik.dashboardEnableError"),
									);
								});
						}}
						className="w-full cursor-pointer space-x-3"
					>
						<span>
							{haveTraefikDashboardPortEnabled
								? t("settings.traefik.disable")
								: t("settings.traefik.enable")}{" "}
							{t("settings.traefik.dashboard")}
						</span>
					</DropdownMenuItem>
					<ManageTraefikPorts serverId={serverId}>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="cursor-pointer"
						>
							<span>{t("settings.server.webServer.traefik.managePorts")}</span>
						</DropdownMenuItem>
					</ManageTraefikPorts>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
