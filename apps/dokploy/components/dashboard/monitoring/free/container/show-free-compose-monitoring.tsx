import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { badgeStateColor } from "@/components/dashboard/application/logs/show";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
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
import { ContainerFreeMonitoring } from "./show-free-container-monitoring";

interface Props {
	appName: string;
	serverId?: string;
	appType: "stack" | "docker-compose";
}

export const ComposeFreeMonitoring = ({
	appName,
	appType = "stack",
	serverId,
}: Props) => {
	const { data, isLoading } = api.docker.getContainersByAppNameMatch.useQuery(
		{
			appName: appName,
			appType,
			serverId,
		},
		{
			enabled: !!appName,
		},
	);

	const [containerAppName, setContainerAppName] = useState<
		string | undefined
	>();

	const [containerId, setContainerId] = useState<string | undefined>();

	const { mutateAsync: restart, isLoading: isRestarting } =
		api.docker.restartContainer.useMutation();

	useEffect(() => {
		if (data && data?.length > 0) {
			setContainerAppName(data[0]?.name);
			setContainerId(data[0]?.containerId);
		}
	}, [data]);

	return (
		<>
			<CardHeader>
				<CardTitle className="text-xl">Monitoring</CardTitle>
				<CardDescription>Watch the usage of your compose</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Label>Select a container to watch the monitoring</Label>
				<div className="flex flex-row gap-4">
					<Select
						onValueChange={(value) => {
							setContainerAppName(value);
							setContainerId(
								data?.find((container) => container.name === value)
									?.containerId,
							);
						}}
						value={containerAppName}
					>
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
								{data?.map((container) => (
									<SelectItem
										key={container.containerId}
										value={container.name}
									>
										{container.name} ({container.containerId}){" "}
										<Badge variant={badgeStateColor(container.state)}>
											{container.state}
										</Badge>
									</SelectItem>
								))}
								<SelectLabel>Containers ({data?.length})</SelectLabel>
							</SelectGroup>
						</SelectContent>
					</Select>
					<Button
						isLoading={isRestarting}
						onClick={async () => {
							if (!containerId) return;
							toast.success(`Restarting container ${containerAppName}`);
							await restart({ containerId }).then(() => {
								toast.success("Container restarted");
							});
						}}
					>
						Restart
					</Button>
				</div>
				<ContainerFreeMonitoring
					appName={containerAppName || ""}
					appType={appType}
				/>
			</CardContent>
		</>
	);
};
