import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { badgeStateColor } from "@/components/dashboard/application/logs/show";
import { Badge } from "@/components/ui/badge";
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

interface Props {
	appName: string;
	serverId?: string;
}

badgeStateColor;

export const ShowDockerLogsStack = ({ appName, serverId }: Props) => {
	const [option, setOption] = useState<"swarm" | "native">("native");
	const [containerId, setContainerId] = useState<string | undefined>();

	const { data: services, isLoading: servicesLoading } =
		api.docker.getStackContainersByAppName.useQuery(
			{
				appName,
				serverId,
			},
			{
				enabled: !!appName && option === "swarm",
			},
		);

	const { data: containers, isLoading: containersLoading } =
		api.docker.getContainersByAppNameMatch.useQuery(
			{
				appName,
				appType: "stack",
				serverId,
			},
			{
				enabled: !!appName && option === "native",
			},
		);

	useEffect(() => {
		if (option === "native") {
			if (containers && containers?.length > 0) {
				setContainerId(containers[0]?.containerId);
			}
		} else {
			if (services && services?.length > 0) {
				setContainerId(services[0]?.containerId);
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
