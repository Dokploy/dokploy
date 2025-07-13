import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import dynamic from "next/dynamic";
import type React from "react";
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
	containerId: string;
	children?: React.ReactNode;
	serverId?: string | null;
}

export const ShowDockerModalStackLogs = ({
	containerId,
	children,
	serverId,
}: Props) => {
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
			<DialogContent className="sm:max-w-7xl">
				<DialogHeader>
					<DialogTitle>View Logs</DialogTitle>
					<DialogDescription>View the logs for {containerId}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 pt-2.5">
					<DockerLogsId
						containerId={containerId || ""}
						serverId={serverId}
						runType="swarm"
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
};
