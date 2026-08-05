import React, { useMemo } from "react";
import { XTerm } from "@/components/dashboard/terminal/xterm";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
	id: string;
	containerId?: string;
	serverId?: string;
	serviceId?: string;
}

export const DockerTerminal: React.FC<Props> = ({
	id,
	containerId,
	serverId,
	serviceId,
}) => {
	const [activeWay, setActiveWay] = React.useState<string | undefined>("bash");
	const query = useMemo(() => {
		const params = new URLSearchParams({
			containerId: containerId ?? "",
			activeWay: activeWay ?? "sh",
		});
		if (serverId) {
			params.set("serverId", serverId);
		}
		if (serviceId) {
			params.set("serviceId", serviceId);
		}
		return params.toString();
	}, [activeWay, containerId, serverId, serviceId]);

	return (
		<div className="flex h-full min-h-0 flex-col gap-4" id={id}>
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
				<XTerm path="/docker-container-terminal" query={query} />
			</div>
		</div>
	);
};
