import React, { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import dynamic from "next/dynamic";

export const DockerLogsId = dynamic(
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
	children?: React.ReactNode;
}

export const ShowModalLogs = ({ appName, children }: Props) => {
	const { data } = api.docker.getContainersByAppLabel.useQuery(
		{
			appName,
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
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					{children}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh]  overflow-y-auto sm:max-w-7xl">
				<DialogHeader>
					<DialogTitle>View Logs</DialogTitle>
					<DialogDescription>View the logs for {appName}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 pt-2.5">
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
					<DockerLogsId id="terminal" containerId={containerId || ""} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
