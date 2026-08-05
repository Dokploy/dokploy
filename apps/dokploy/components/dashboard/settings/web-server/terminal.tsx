import type React from "react";
import { useMemo } from "react";
import { XTerm } from "@/components/dashboard/terminal/xterm";
import { getLocalServerData } from "./local-server-config";

interface Props {
	id: string;
	serverId: string;
}

export const Terminal: React.FC<Props> = ({ id, serverId }) => {
	const query = useMemo(() => {
		const urlParams = new URLSearchParams();
		urlParams.set("serverId", serverId);

		if (serverId === "local") {
			const { port, username } = getLocalServerData();
			urlParams.set("port", port.toString());
			urlParams.set("username", username);
		}
		return urlParams.toString();
	}, [serverId]);

	return (
		<div className="h-full min-h-0 w-full" id={id}>
			<XTerm path="/terminal" query={query} />
		</div>
	);
};
