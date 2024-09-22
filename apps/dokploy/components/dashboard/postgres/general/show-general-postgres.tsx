import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Terminal } from "lucide-react";
import React from "react";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { StartPostgres } from "../start-postgres";
import { DeployPostgres } from "./deploy-postgres";
import { ResetPostgres } from "./reset-postgres";
import { StopPostgres } from "./stop-postgres";
interface Props {
	postgresId: string;
}

export const ShowGeneralPostgres = ({ postgresId }: Props) => {
	const { data } = api.postgres.one.useQuery(
		{
			postgresId,
		},
		{ enabled: !!postgresId },
	);

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Deploy Settings</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-row gap-4 flex-wrap">
					<DeployPostgres postgresId={postgresId} />
					<ResetPostgres
						postgresId={postgresId}
						appName={data?.appName || ""}
					/>
					{data?.applicationStatus === "idle" ? (
						<StartPostgres postgresId={postgresId} />
					) : (
						<StopPostgres postgresId={postgresId} />
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
	);
};
