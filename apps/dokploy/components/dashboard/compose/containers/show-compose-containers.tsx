import { Loader2, MoreHorizontal, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
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
import { ShowContainerConfig } from "@/components/dashboard/docker/config/show-container-config";
import { ShowContainerMounts } from "@/components/dashboard/docker/mounts/show-container-mounts";
import { ShowContainerNetworks } from "@/components/dashboard/docker/networks/show-container-networks";
import { DockerTerminalModal } from "@/components/dashboard/docker/terminal/docker-terminal-modal";

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
}

export const ShowComposeContainers = ({
	appName,
	appType,
	serverId,
}: Props) => {
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
					<CardTitle className="text-xl">Containers</CardTitle>
					<CardDescription>
						Inspect each container in this compose and run basic lifecycle
						actions.
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
							No containers found. Deploy the compose to see containers here.
						</span>
					</div>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>State</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Container ID</TableHead>
									<TableHead className="text-right" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.map((container) => (
									<ContainerRow
										key={container.containerId}
										container={container}
										serverId={serverId}
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
	};
	serverId?: string;
	onActionComplete: () => void;
}

const ContainerRow = ({
	container,
	serverId,
	onActionComplete,
}: ContainerRowProps) => {
	const [logsOpen, setLogsOpen] = useState(false);
	const [actionLoading, setActionLoading] = useState<string | null>(null);

	const restartMutation = api.docker.restartContainer.useMutation();
	const startMutation = api.docker.startContainer.useMutation();
	const stopMutation = api.docker.stopContainer.useMutation();
	const killMutation = api.docker.killContainer.useMutation();

	const handleAction = async (
		action: string,
		mutationFn: typeof restartMutation,
	) => {
		setActionLoading(action);
		try {
			await mutationFn.mutateAsync({
				containerId: container.containerId,
				serverId,
			});
			toast.success(`Container ${action} successfully`);
			onActionComplete();
		} catch (error) {
			toast.error(
				`Failed to ${action} container: ${error instanceof Error ? error.message : "Unknown error"}`,
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
							: container.state === "exited"
								? "secondary"
								: "destructive"
					}
				>
					{container.state}
				</Badge>
			</TableCell>
			<TableCell>{container.status}</TableCell>
			<TableCell className="font-mono text-sm text-muted-foreground">
				{container.containerId}
			</TableCell>
			<TableCell className="text-right">
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
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DialogTrigger asChild>
								<DropdownMenuItem
									className="cursor-pointer"
									onSelect={(e) => e.preventDefault()}
								>
									View Logs
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
							>
								Terminal
							</DockerTerminalModal>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="cursor-pointer"
								disabled={actionLoading !== null}
								onClick={() => handleAction("restart", restartMutation)}
							>
								Restart
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer"
								disabled={actionLoading !== null}
								onClick={() => handleAction("start", startMutation)}
							>
								Start
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer"
								disabled={actionLoading !== null}
								onClick={() => handleAction("stop", stopMutation)}
							>
								Stop
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer text-red-500 focus:text-red-600"
								disabled={actionLoading !== null}
								onClick={() => handleAction("kill", killMutation)}
							>
								Kill
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<DialogContent className="sm:max-w-7xl">
						<DialogHeader>
							<DialogTitle>View Logs</DialogTitle>
							<DialogDescription>Logs for {container.name}</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-4 pt-2.5">
							<DockerLogsId
								containerId={container.containerId}
								serverId={serverId}
								runType="native"
							/>
						</div>
					</DialogContent>
				</Dialog>
			</TableCell>
		</TableRow>
	);
};
