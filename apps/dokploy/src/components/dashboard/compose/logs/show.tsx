import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { api } from "~/utils/api";
export const DockerLogs = dynamic(
	() =>
		import("~/components/dashboard/docker/logs/docker-logs-id").then(
			(e) => e.DockerLogsId,
		),
	{
		ssr: false,
	},
);

interface Props {
	appName: string;
	appType: "stack" | "docker-compose";
}

export const ShowDockerLogsCompose = ({ appName, appType }: Props) => {
	const { data } = api.docker.getContainersByAppNameMatch.useQuery(
		{
			appName,
			appType,
		},
		{
			enabled: !!appName,
		},
	);
	const [containerId, setContainerId] = useState<string | undefined>();

	useEffect(() => {
		if (data && data?.length > 0) {
			setContainerId(data[0]?.containerId);
		}
	}, [data]);

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Logs</CardTitle>
				<CardDescription>
					Watch the logs of the application in real time
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<Label>Select a container to view logs</Label>
				<Select onValueChange={setContainerId} value={containerId}>
					<SelectTrigger>
						<SelectValue placeholder="Select a container" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{data?.map((container) => (
								<SelectItem
									key={container.containerId}
									value={container.containerId}
								>
									{container.name} ({container.containerId}) {container.state}
								</SelectItem>
							))}
							<SelectLabel>Containers ({data?.length})</SelectLabel>
						</SelectGroup>
					</SelectContent>
				</Select>
				<DockerLogs
					id="terminal"
					containerId={containerId || "select-a-container"}
				/>
			</CardContent>
		</Card>
	);
};
