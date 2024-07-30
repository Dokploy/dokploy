import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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
import dynamic from "next/dynamic";
import type React from "react";
import { useEffect, useState } from "react";

const Terminal = dynamic(
	() =>
		import("@/components/dashboard/docker/terminal/docker-terminal").then(
			(e) => e.DockerTerminal,
		),
	{
		ssr: false,
	},
);

interface Props {
	appName: string;
	children?: React.ReactNode;
}

export const DockerTerminalModal = ({ children, appName }: Props) => {
	const { data } = api.docker.getContainersByAppNameMatch.useQuery(
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
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="max-h-[85vh]    overflow-y-auto sm:max-w-7xl">
				<DialogHeader>
					<DialogTitle>Docker Terminal</DialogTitle>
					<DialogDescription>
						Easy way to access to docker container
					</DialogDescription>
				</DialogHeader>
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
				<Terminal
					id="terminal"
					containerId={containerId || "select-a-container"}
				/>
			</DialogContent>
		</Dialog>
	);
};
