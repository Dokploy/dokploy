import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Terminal } from "lucide-react";
import React from "react";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { StartMariadb } from "../start-mariadb";
import { DeployMariadb } from "./deploy-mariadb";
import { ResetMariadb } from "./reset-mariadb";
import { StopMariadb } from "./stop-mariadb";

interface Props {
	mariadbId: string;
}

export const ShowGeneralMariadb = ({ mariadbId }: Props) => {
	const { data } = api.mariadb.one.useQuery(
		{
			mariadbId,
		},
		{ enabled: !!mariadbId },
	);

	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						<DeployMariadb mariadbId={mariadbId} />
						<ResetMariadb mariadbId={mariadbId} appName={data?.appName || ""} />
						{data?.applicationStatus === "idle" ? (
							<StartMariadb mariadbId={mariadbId} />
						) : (
							<StopMariadb mariadbId={mariadbId} />
						)}
						<DockerTerminalModal
							appName={data?.appName || ""}
							serverId={data?.serverId || ""}
						>
							<Button variant="outline">
								<Terminal />
								Open Terminal
							</Button>
						</DockerTerminalModal>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
