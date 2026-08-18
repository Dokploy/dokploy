import { useState } from "react";
import { XTerm } from "@/components/dashboard/terminal/xterm";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
	containerId?: string;
	serverId?: string;
	serviceId?: string;
}

const PLACEHOLDER_CONTAINER_ID = "select-a-container";

export const DockerTerminal = ({ containerId, serverId, serviceId }: Props) => {
	const [activeWay, setActiveWay] = useState("bash");
	const hasContainer =
		!!containerId && containerId !== PLACEHOLDER_CONTAINER_ID;
	const params = new URLSearchParams({
		containerId: containerId ?? "",
		activeWay,
	});
	if (serverId) {
		params.set("serverId", serverId);
	}
	if (serviceId) {
		params.set("serviceId", serviceId);
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-4">
			{hasContainer && (
				<div className="flex shrink-0 flex-col gap-2">
					<span>
						Select way to connect to <b>{containerId}</b>
					</span>
					<Tabs value={activeWay} onValueChange={setActiveWay}>
						<TabsList>
							<TabsTrigger value="bash">Bash</TabsTrigger>
							<TabsTrigger value="sh">/bin/sh</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
			)}
			{hasContainer ? (
				<div className="min-h-0 flex-1">
					<XTerm path="/docker-container-terminal" query={params.toString()} />
				</div>
			) : (
				<div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
					Select a container above to open a terminal. If none are listed, make
					sure the service is deployed and running.
				</div>
			)}
		</div>
	);
};
