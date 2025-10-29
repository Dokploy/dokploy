import { useTranslation } from "next-i18next";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
	const [showWarningDialog, setShowWarningDialog] = useState(false);
	const { mutateAsync: reloadTraefik, isLoading: reloadTraefikIsLoading } =
		api.settings.reloadTraefik.useMutation();

	const { mutateAsync: toggleDashboard, isLoading: toggleDashboardIsLoading } =
		api.settings.toggleDashboard.useMutation();

	const { data: haveTraefikDashboardPortEnabled, refetch: refetchDashboard } =
		api.settings.haveTraefikDashboardPortEnabled.useQuery({
			serverId,
		});

	const handleToggleDashboard = async () => {
		// If disabling, proceed directly without warning
		if (haveTraefikDashboardPortEnabled) {
			await toggleDashboard({
				enableDashboard: false,
				serverId: serverId,
			})
				.then(async () => {
					toast.success("Disabled Dashboard");
					refetchDashboard();
				})
				.catch(() => {});
		} else {
			// If enabling, show warning dialog
			setShowWarningDialog(true);
		}
	};

	const handleConfirmEnableDashboard = async () => {
		setShowWarningDialog(false);
		await toggleDashboard({
			enableDashboard: true,
			serverId: serverId,
		})
			.then(async () => {
				toast.success("Enabled Dashboard");
				refetchDashboard();
			})
			.catch(() => {});
	};

	return (
		<>
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
										toast.success("Traefik Reloaded");
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
							onClick={handleToggleDashboard}
							className="w-full cursor-pointer space-x-3"
						>
							<span>
								{haveTraefikDashboardPortEnabled ? "Disable" : "Enable"}{" "}
								Dashboard
							</span>
						</DropdownMenuItem>
						<ManageTraefikPorts serverId={serverId}>
							<DropdownMenuItem
								onSelect={(e) => e.preventDefault()}
								className="cursor-pointer"
							>
								<span>
									{t("settings.server.webServer.traefik.managePorts")}
								</span>
							</DropdownMenuItem>
						</ManageTraefikPorts>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-destructive" />
							Warning: Port Conflict Risk
						</AlertDialogTitle>
						<AlertDialogDescription className="space-y-2">
							<p>
								Enabling the Traefik dashboard will expose it on port 8080. This
								may conflict with other services already using port 8080 and
								could cause your server to become unreachable.
							</p>
							<p className="font-medium text-destructive mt-4">
								Please ensure no other service is using port 8080 before
								proceeding.
							</p>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmEnableDashboard}
							variant="default"
							disabled={toggleDashboardIsLoading}
						>
							I understand, enable dashboard
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
