import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
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
import { useHealthCheckAfterMutation } from "@/hooks/use-health-check-after-mutation";
import { api } from "@/utils/api";
import { EditTraefikEnv } from "../../web-server/edit-traefik-env";
import { ManageTraefikPorts } from "../../web-server/manage-traefik-ports";
import { ShowModalLogs } from "../../web-server/show-modal-logs";
import { UpdateTraefikVersion } from "../../web-server/update-traefik-version";

interface Props {
	serverId?: string;
}
export const ShowTraefikActions = ({ serverId }: Props) => {
	const { mutateAsync: reloadTraefik, isPending: reloadTraefikIsLoading } =
		api.settings.reloadTraefik.useMutation();

	const { mutateAsync: toggleDashboard, isPending: toggleDashboardIsLoading } =
		api.settings.toggleDashboard.useMutation();

	const { data: haveTraefikDashboardPortEnabled, refetch: refetchDashboard } =
		api.settings.haveTraefikDashboardPortEnabled.useQuery({
			serverId,
		});

	const {
		mutateAsync: toggleCompression,
		isPending: toggleCompressionIsLoading,
	} = api.settings.toggleTraefikCompression.useMutation();

	const { data: haveTraefikCompressionEnabled, refetch: refetchCompression } =
		api.settings.haveTraefikCompressionEnabled.useQuery({
			serverId,
		});

	const {
		execute: executeWithHealthCheck,
		isExecuting: isHealthCheckExecuting,
	} = useHealthCheckAfterMutation({
		initialDelay: 5000,
		pollInterval: 4000,
		successMessage: "Traefik dashboard updated successfully",
		onSuccess: () => {
			refetchDashboard();
		},
	});

	const {
		execute: executeCompressionWithHealthCheck,
		isExecuting: isCompressionHealthCheckExecuting,
	} = useHealthCheckAfterMutation({
		initialDelay: 5000,
		pollInterval: 4000,
		successMessage: "Traefik compression updated successfully",
		onSuccess: () => {
			refetchCompression();
		},
	});

	const {
		execute: executeReloadWithHealthCheck,
		isExecuting: isReloadHealthCheckExecuting,
	} = useHealthCheckAfterMutation({
		initialDelay: 5000,
		pollInterval: 4000,
		successMessage: "Traefik Reloaded",
	});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				asChild
				disabled={
					reloadTraefikIsLoading ||
					toggleDashboardIsLoading ||
					isHealthCheckExecuting ||
					isReloadHealthCheckExecuting ||
					toggleCompressionIsLoading ||
					isCompressionHealthCheckExecuting
				}
			>
				<Button
					isLoading={
						reloadTraefikIsLoading ||
						toggleDashboardIsLoading ||
						isHealthCheckExecuting ||
						isReloadHealthCheckExecuting ||
						toggleCompressionIsLoading ||
						isCompressionHealthCheckExecuting
					}
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
							try {
								await executeReloadWithHealthCheck(() =>
									reloadTraefik({ serverId }),
								);
							} catch (error) {
								const errorMessage =
									(error as Error)?.message ||
									"Failed to reload Traefik. Please try again.";
								toast.error(errorMessage);
							}
						}}
						className="cursor-pointer"
						disabled={isReloadHealthCheckExecuting}
					>
						<span>Reload</span>
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
							View Logs
						</DropdownMenuItem>
					</ShowModalLogs>
					<EditTraefikEnv serverId={serverId}>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="cursor-pointer"
						>
							<span>Modify Environment</span>
						</DropdownMenuItem>
					</EditTraefikEnv>

					<DialogAction
						title={
							haveTraefikDashboardPortEnabled
								? "Disable Traefik Dashboard"
								: "Enable Traefik Dashboard"
						}
						description={
							<div className="space-y-4">
								<AlertBlock type="warning">
									The Traefik container will be recreated from scratch. This
									means the container will be deleted and created again, which
									may cause downtime in your applications.
								</AlertBlock>
								<p>
									Are you sure you want to{" "}
									{haveTraefikDashboardPortEnabled ? "disable" : "enable"} the
									Traefik dashboard?
								</p>
							</div>
						}
						onClick={async () => {
							try {
								await executeWithHealthCheck(() =>
									toggleDashboard({
										enableDashboard: !haveTraefikDashboardPortEnabled,
										serverId: serverId,
									}),
								);
							} catch (error) {
								const errorMessage =
									(error as Error)?.message ||
									"Failed to toggle dashboard. Please check if port 8080 is available.";
								toast.error(errorMessage);
							}
						}}
						disabled={toggleDashboardIsLoading || isHealthCheckExecuting}
						type="default"
					>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="w-full cursor-pointer space-x-3"
						>
							<span>
								{haveTraefikDashboardPortEnabled ? "Disable" : "Enable"}{" "}
								Dashboard
							</span>
						</DropdownMenuItem>
					</DialogAction>
					<DialogAction
						title={
							haveTraefikCompressionEnabled
								? "Disable Response Compression"
								: "Enable Response Compression"
						}
						description={
							<div className="space-y-4">
								<AlertBlock type="warning">
									Traefik will be restarted to apply this change, which may
									cause a brief downtime in your applications.
								</AlertBlock>
								<p>
									{haveTraefikCompressionEnabled
										? "Responses will be served uncompressed again, unless your applications compress them."
										: "Text-based responses (HTML, CSS, JavaScript, JSON, XML, SVG) of every application served by this Traefik will be compressed with zstd, Brotli or gzip, depending on what the client supports."}
								</p>
							</div>
						}
						onClick={async () => {
							try {
								await executeCompressionWithHealthCheck(() =>
									toggleCompression({
										enableCompression: !haveTraefikCompressionEnabled,
										serverId: serverId,
									}),
								);
							} catch (error) {
								const errorMessage =
									(error as Error)?.message ||
									"Failed to update Traefik compression. Please try again.";
								toast.error(errorMessage);
							}
						}}
						disabled={
							toggleCompressionIsLoading || isCompressionHealthCheckExecuting
						}
						type="default"
					>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="w-full cursor-pointer space-x-3"
						>
							<span>
								{haveTraefikCompressionEnabled ? "Disable" : "Enable"}{" "}
								Compression
							</span>
						</DropdownMenuItem>
					</DialogAction>
					<ManageTraefikPorts serverId={serverId}>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="cursor-pointer"
						>
							<span>Additional Port Mappings</span>
						</DropdownMenuItem>
					</ManageTraefikPorts>
					<UpdateTraefikVersion serverId={serverId}>
						<DropdownMenuItem
							onSelect={(e) => e.preventDefault()}
							className="cursor-pointer"
						>
							<span>Check Version</span>
						</DropdownMenuItem>
					</UpdateTraefikVersion>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
