import { Loader2, MoreHorizontal, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ShowContainerConfig } from "@/components/dashboard/docker/config/show-container-config";
import { ShowContainerMounts } from "@/components/dashboard/docker/mounts/show-container-mounts";
import { ShowContainerNetworks } from "@/components/dashboard/docker/networks/show-container-networks";
import { DockerTerminalModal } from "@/components/dashboard/docker/terminal/docker-terminal-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";

const DockerLogsId = dynamic(
	() =>
		import("@/components/dashboard/docker/logs/docker-logs-id").then(
			(e) => e.DockerLogsId,
		),
	{
		ssr: false,
	},
);

interface Props {
	appName: string;
	serverId?: string;
	appType: "stack" | "docker-compose";
	serviceId?: string;
}

export const ShowComposeContainers = ({
	appName,
	appType,
	serverId,
	serviceId,
}: Props) => {
	const { t } = useTranslation();
	const { data, isPending, refetch } =
		api.docker.getContainersByAppNameMatch.useQuery(
			{
				appName,
				appType,
				serverId,
			},
			{
				enabled: !!appName,
			},
		);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle className="text-xl">{t("compose.containers")}</CardTitle>
					<CardDescription>
						{t("compose.containersDescription")}
					</CardDescription>
				</div>
				<Button
					variant="outline"
					size="icon"
					onClick={() => refetch()}
					disabled={isPending}
				>
					<RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
				</Button>
			</CardHeader>
			<CardContent>
				{isPending ? (
					<div className="flex items-center justify-center h-[20vh]">
						<Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex items-center justify-center h-[20vh]">
						<span className="text-muted-foreground">
							{t("compose.noContainers")}
						</span>
					</div>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("compose.tableName")}</TableHead>
									<TableHead>{t("compose.tableState")}</TableHead>
									<TableHead>{t("compose.tableStatus")}</TableHead>
									{appType === "stack" && (
										<TableHead>{t("compose.tableNode")}</TableHead>
									)}
									<TableHead>{t("compose.tableContainerId")}</TableHead>
									<TableHead className="text-right" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.map((container) => (
									<ContainerRow
										key={container.name}
										container={container}
										appType={appType}
										serverId={serverId}
										serviceId={serviceId}
										onActionComplete={() => refetch()}
									/>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
};

interface ContainerRowProps {
	container: {
		containerId: string;
		name: string;
		state: string;
		status: string;
		node?: string;
	};
	appType: "stack" | "docker-compose";
	serverId?: string;
	serviceId?: string;
	onActionComplete: () => void;
}

const ContainerRow = ({
	container,
	appType,
	serverId,
	serviceId,
	onActionComplete,
}: ContainerRowProps) => {
	const { t } = useTranslation();
	const [logsOpen, setLogsOpen] = useState(false);
	const [actionLoading, setActionLoading] = useState<string | null>(null);

	const restartMutation = api.docker.restartContainer.useMutation();
	const startMutation = api.docker.startContainer.useMutation();
	const stopMutation = api.docker.stopContainer.useMutation();
	const killMutation = api.docker.killContainer.useMutation();

	const actionMessages: Record<string, { success: string; error: string }> = {
		restart: {
			success: "compose.containerRestarted",
			error: "compose.containerRestartError",
		},
		start: {
			success: "compose.containerStarted",
			error: "compose.containerStartError",
		},
		stop: {
			success: "compose.containerStopped",
			error: "compose.containerStopError",
		},
		kill: {
			success: "compose.containerKilled",
			error: "compose.containerKillError",
		},
	};

	const handleAction = async (
		action: string,
		mutationFn: typeof restartMutation,
	) => {
		setActionLoading(action);
		const messages = actionMessages[action] ?? {
			success: "compose.containerRestarted",
			error: "compose.containerRestartError",
		};
		try {
			await mutationFn.mutateAsync({
				containerId: container.containerId,
				serverId,
			});
			toast.success(t(messages.success));
			onActionComplete();
		} catch (error) {
			toast.error(
				t(messages.error, {
					error:
						error instanceof Error ? error.message : t("compose.unknownError"),
				}),
			);
		} finally {
			setActionLoading(null);
		}
	};

	return (
		<TableRow>
			<TableCell className="font-medium">{container.name}</TableCell>
			<TableCell>
				<Badge
					variant={
						container.state === "running"
							? "default"
							: [
										"exited",
										"pending",
										"preparing",
										"starting",
										"ready",
									].includes(container.state)
								? "secondary"
								: "destructive"
					}
				>
					{container.state}
				</Badge>
			</TableCell>
			<TableCell>{container.status}</TableCell>
			{appType === "stack" && <TableCell>{container.node || "-"}</TableCell>}
			<TableCell className="font-mono text-sm text-muted-foreground">
				{container.containerId || "-"}
			</TableCell>
			<TableCell className="text-right">
				{!container.containerId ? null : (
					<Dialog open={logsOpen} onOpenChange={setLogsOpen}>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" className="h-8 w-8 p-0">
									{actionLoading ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<MoreHorizontal className="h-4 w-4" />
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>{t("compose.actions")}</DropdownMenuLabel>
								<DialogTrigger asChild>
									<DropdownMenuItem
										className="cursor-pointer"
										onSelect={(e) => e.preventDefault()}
									>
										{t("compose.viewLogs")}
									</DropdownMenuItem>
								</DialogTrigger>
								<ShowContainerConfig
									containerId={container.containerId}
									serverId={serverId || ""}
								/>
								<ShowContainerMounts
									containerId={container.containerId}
									serverId={serverId || ""}
								/>
								<ShowContainerNetworks
									containerId={container.containerId}
									serverId={serverId || ""}
								/>
								<DockerTerminalModal
									containerId={container.containerId}
									serverId={serverId || ""}
									serviceId={serviceId}
								>
									{t("compose.terminal")}
								</DockerTerminalModal>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="cursor-pointer"
									disabled={actionLoading !== null}
									onClick={() => handleAction("restart", restartMutation)}
								>
									{t("compose.restart")}
								</DropdownMenuItem>
								<DropdownMenuItem
									className="cursor-pointer"
									disabled={actionLoading !== null}
									onClick={() => handleAction("start", startMutation)}
								>
									{t("compose.start")}
								</DropdownMenuItem>
								<DropdownMenuItem
									className="cursor-pointer"
									disabled={actionLoading !== null}
									onClick={() => handleAction("stop", stopMutation)}
								>
									{t("compose.stop")}
								</DropdownMenuItem>
								<DropdownMenuItem
									className="cursor-pointer text-red-500 focus:text-red-600"
									disabled={actionLoading !== null}
									onClick={() => handleAction("kill", killMutation)}
								>
									{t("compose.kill")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<DialogContent className="sm:max-w-7xl">
							<DialogHeader>
								<DialogTitle>{t("compose.viewLogs")}</DialogTitle>
								<DialogDescription>
									{t("compose.logsFor", { name: container.name })}
								</DialogDescription>
							</DialogHeader>
							<div className="flex flex-col gap-4 pt-2.5">
								<DockerLogsId
									containerId={container.containerId}
									serverId={serverId}
									runType="native"
									serviceId={serviceId}
								/>
							</div>
						</DialogContent>
					</Dialog>
				)}
			</TableCell>
		</TableRow>
	);
};
