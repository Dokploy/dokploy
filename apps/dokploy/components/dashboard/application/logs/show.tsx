import { Loader2, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
export const DockerLogs = dynamic(
	() =>
		import("@/components/dashboard/docker/logs/docker-logs-id").then(
			(e) => e.DockerLogsId,
		),
	{
		ssr: false,
	},
);

export const badgeStateColor = (state: string) => {
	switch (state) {
		case "running":
			return "green";
		case "exited":
		case "shutdown":
			return "red";
		case "accepted":
		case "created":
			return "blue";
		default:
			return "default";
	}
};

interface Props {
	appName: string;
	serverId?: string;
}

export const ShowDockerLogs = ({ appName, serverId }: Props) => {
	const [containerId, setContainerId] = useState<string>("");
	const [option, setOption] = useState<"swarm" | "native">("native");

	const {
		data: services,
		isLoading: servicesLoading,
		refetch: refetchServices,
	} = api.docker.getServiceContainersByAppName.useQuery(
		{
			appName,
			serverId,
		},
		{
			enabled: !!appName && option === "swarm",
			refetchInterval: 5000, // Refetch every 5 seconds to catch newly created containers
		},
	);

	const {
		data: containers,
		isLoading: containersLoading,
		refetch: refetchContainers,
	} = api.docker.getContainersByAppNameMatch.useQuery(
		{
			appName,
			serverId,
		},
		{
			enabled: !!appName && option === "native",
			refetchInterval: 5000, // Refetch every 5 seconds to catch newly created containers
		},
	);

	useEffect(() => {
		if (option === "native") {
			if (containers && containers?.length > 0) {
				setContainerId(containers[0]?.containerId || "");
			} else {
				setContainerId("");
			}
		} else {
			if (services && services?.length > 0) {
				setContainerId(services[0]?.containerId || "");
			} else {
				setContainerId("");
			}
		}
	}, [option, services, containers]);

	const isLoading = option === "native" ? containersLoading : servicesLoading;
	const containersLenght =
		option === "native" ? containers?.length : services?.length;

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Logs</CardTitle>
				<CardDescription>
					Watch the logs of the application in real time
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-row justify-between items-center gap-2">
					<Label>Select a container to view logs</Label>
					<div className="flex flex-row gap-2 items-center">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								if (option === "native") {
									refetchContainers();
								} else {
									refetchServices();
								}
							}}
							disabled={isLoading}
						>
							<RefreshCw
								className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
							/>
						</Button>
						<span className="text-sm text-muted-foreground">
							{option === "native" ? "Native" : "Swarm"}
						</span>
						<Switch
							checked={option === "native"}
							onCheckedChange={(checked) => {
								setOption(checked ? "native" : "swarm");
							}}
						/>
					</div>
				</div>

				<Select onValueChange={setContainerId} value={containerId}>
					<SelectTrigger>
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<SelectValue placeholder="Select a container" />
						)}
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{option === "native" ? (
								<div>
									{containers?.map((container) => (
										<SelectItem
											key={container.containerId}
											value={container.containerId}
										>
											{container.name} ({container.containerId}){" "}
											<Badge variant={badgeStateColor(container.state)}>
												{container.state}
											</Badge>
										</SelectItem>
									))}
								</div>
							) : (
								<>
									{services?.map((container) => (
										<SelectItem
											key={container.containerId}
											value={container.containerId}
										>
											{container.name} ({container.containerId}@{container.node}
											)
											<Badge variant={badgeStateColor(container.state)}>
												{container.state}
											</Badge>
										</SelectItem>
									))}
								</>
							)}

							<SelectLabel>Containers ({containersLenght})</SelectLabel>
							{containersLenght === 0 && !isLoading && (
								<SelectItem value="no-containers" disabled>
									No containers found. Try refreshing or check if the
									application is running.
								</SelectItem>
							)}
						</SelectGroup>
					</SelectContent>
				</Select>
				<DockerLogs
					serverId={serverId || ""}
					containerId={containerId || "select-a-container"}
					runType={option}
				/>
			</CardContent>
		</Card>
	);
};
