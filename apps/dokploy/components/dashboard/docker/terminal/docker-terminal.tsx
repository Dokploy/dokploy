import { useState } from "react";
import { XTerm } from "@/components/dashboard/terminal/xterm";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
	containerId?: string;
	serverId?: string;
	serviceId?: string;
}

export const DockerTerminal = ({ containerId, serverId, serviceId }: Props) => {
	const [activeWay, setActiveWay] = useState("bash");
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
			<div className="min-h-0 flex-1">
				<XTerm path="/docker-container-terminal" query={params.toString()} />
			</div>
		</div>
	);
};
