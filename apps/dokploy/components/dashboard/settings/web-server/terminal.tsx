import { useMemo } from "react";
import { XTerm } from "@/components/dashboard/terminal/xterm";
import { getLocalServerData } from "./local-server-config";

interface Props {
	serverId: string;
}

export const Terminal = ({ serverId }: Props) => {
	const query = useMemo(() => {
		const urlParams = new URLSearchParams({ serverId });

		if (serverId === "local") {
			const { port, username } = getLocalServerData();
			urlParams.set("port", port.toString());
			urlParams.set("username", username);
		}

		return urlParams.toString();
	}, [serverId]);

	return (
		<div className="h-full min-h-0 w-full">
			<XTerm path="/terminal" query={query} />
		</div>
	);
};
