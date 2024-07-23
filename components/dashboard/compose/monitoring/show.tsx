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
import { api } from "@/utils/api";
import { useEffect, useState } from "react";
import { DockerMonitoring } from "../../monitoring/docker/show";

interface Props {
	appName: string;
	appType: "stack" | "docker-compose";
}

export const ShowMonitoringCompose = ({
	appName,
	appType = "stack",
}: Props) => {
	const { data } = api.docker.getContainersByAppNameMatch.useQuery(
		{
			appName: appName,
			appType,
		},
		{
			enabled: !!appName,
		},
	);

	const [containerAppName, setContainerAppName] = useState<
		string | undefined
	>();

	useEffect(() => {
		if (data && data?.length > 0) {
			setContainerAppName(data[0]?.name);
		}
	}, [data]);

	return (
		<div>
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Monitoring</CardTitle>
					<CardDescription>Watch the usage of your compose</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<Label>Select a container to watch the monitoring</Label>
					<Select onValueChange={setContainerAppName} value={containerAppName}>
						<SelectTrigger>
							<SelectValue placeholder="Select a container" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{data?.map((container) => (
									<SelectItem
										key={container.containerId}
										value={container.name}
									>
										{container.name} ({container.containerId}) {container.state}
									</SelectItem>
								))}
								<SelectLabel>Containers ({data?.length})</SelectLabel>
							</SelectGroup>
						</SelectContent>
					</Select>
					<DockerMonitoring
						appName={containerAppName || ""}
						appType={appType}
					/>
				</CardContent>
			</Card>
		</div>
	);
};
