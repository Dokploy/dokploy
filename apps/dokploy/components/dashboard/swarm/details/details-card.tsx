import { Box, Cpu, Database, HardDrive, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api } from "@/utils/api";
import { ShowNodeApplications } from "../applications/show-applications";
import { ShowNodeConfig } from "./show-node-config";

export interface SwarmList {
	ID: string;
	Hostname: string;
	Availability: string;
	EngineVersion: string;
	Status: string;
	ManagerStatus: string;
	TLSStatus: string;
}

interface Props {
	node: SwarmList;
	serverId?: string;
}

const getManagerStatusLabel = (status: string | undefined, t: any) => {
	const normalized = status?.toLowerCase();
	switch (normalized) {
		case "leader":
			return t("swarm.nodes.managerStatus.leader");
		case "reachable":
			return t("swarm.nodes.managerStatus.reachable");
		case "unavailable":
			return t("swarm.nodes.managerStatus.unavailable");
		default:
			return t("swarm.nodes.managerStatus.worker");
	}
};

const getAvailabilityLabel = (availability: string | undefined, t: any) => {
	const normalized = availability?.toLowerCase();
	switch (normalized) {
		case "active":
			return t("swarm.nodes.availability.active");
		case "pause":
			return t("swarm.nodes.availability.pause");
		case "drain":
			return t("swarm.nodes.availability.drain");
		default:
			return availability || "-";
	}
};

const getTlsStatusLabel = (status: string | undefined, t: any) => {
	const normalized = status?.toLowerCase();
	switch (normalized) {
		case "ready":
			return t("swarm.nodes.tlsStatus.ready");
		case "unavailable":
			return t("swarm.nodes.tlsStatus.unavailable");
		default:
			return status || "-";
	}
};

export function NodeCard({ node, serverId }: Props) {
	const { t } = useTranslation("common");
	const { data, isLoading } = api.swarm.getNodeInfo.useQuery({
		nodeId: node.ID,
		serverId,
	});

	if (isLoading) {
		return (
			<Card className="w-full bg-background">
				<CardHeader>
					<CardTitle className="flex items-center justify-between text-lg">
						<span className="flex items-center gap-2">{node.Hostname}</span>
						<Badge variant="green">
							{getManagerStatusLabel(node.ManagerStatus, t)}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full bg-background">
			<CardHeader>
				<CardTitle className="text-lg">
					{t("swarm.nodes.card.title")}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-6">
					<div className="flex flex-wrap gap-y-2 items-center justify-between">
						<div className="flex items-center space-x-4 p-2 rounded-xl border">
							<div
								className={`h-2.5 w-2.5 rounded-full ${node.Status === "Ready" ? "bg-green-500" : "bg-red-500"}`}
							/>
							<div className="font-medium">{node.Hostname}</div>
							<Badge variant="green">
								{getManagerStatusLabel(node.ManagerStatus, t)}
							</Badge>
						</div>
						<div className="flex flex-wrap items-center gap-4">
							<Badge variant="green">
								{t("swarm.nodes.tlsStatus")}:{" "}
								{getTlsStatusLabel(node.TLSStatus, t)}
							</Badge>
							<Badge variant="blue">
								{t("swarm.nodes.availability")}:{" "}
								{getAvailabilityLabel(node.Availability, t)}
							</Badge>
						</div>
					</div>

					<Separator />

					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						<div className="space-y-2 flex flex-col items-center text-center">
							<div className="flex items-center text-sm text-muted-foreground">
								<HardDrive className="mr-2 h-4 w-4" />
								{t("swarm.nodes.engineVersion")}
							</div>
							<div>{node.EngineVersion}</div>
						</div>
						<div className="space-y-2 flex flex-col items-center text-center">
							<div className="flex items-center text-sm text-muted-foreground">
								<Cpu className="mr-2 h-4 w-4" />
								{t("swarm.nodes.cpu")}
							</div>
							<div>
								{data &&
									(data.Description?.Resources?.NanoCPUs / 1e9).toFixed(2)}{" "}
								{t("swarm.nodes.cores")}
							</div>
						</div>
						<div className="space-y-2 flex flex-col items-center text-center">
							<div className="flex items-center text-sm text-muted-foreground">
								<Database className="mr-2 h-4 w-4" />
								{t("swarm.nodes.memory")}
							</div>
							<div>
								{data &&
									(
										data.Description?.Resources?.MemoryBytes /
										1024 ** 3
									).toFixed(2)}{" "}
								{t("swarm.nodes.gb")}
							</div>
						</div>
						<div className="space-y-2 flex flex-col items-center text-center">
							<div className="flex items-center text-sm text-muted-foreground">
								<Box className="mr-2 h-4 w-4" />
								{t("swarm.nodes.ipAddress")}
							</div>
							<div>{data?.Status?.Addr}</div>
						</div>
					</div>

					<div className="flex justify-end w-full space-x-4">
						<ShowNodeConfig nodeId={node.ID} serverId={serverId} />
						<ShowNodeApplications serverId={serverId} />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
