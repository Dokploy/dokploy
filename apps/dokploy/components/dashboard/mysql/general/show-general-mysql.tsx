import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Terminal } from "lucide-react";
import React from "react";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { StartMysql } from "../start-mysql";
import { DeployMysql } from "./deploy-mysql";
import { ResetMysql } from "./reset-mysql";
import { StopMysql } from "./stop-mysql";
interface Props {
	mysqlId: string;
}

export const ShowGeneralMysql = ({ mysqlId }: Props) => {
	const { data } = api.mysql.one.useQuery(
		{
			mysqlId,
		},
		{ enabled: !!mysqlId },
	);
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						<DeployMysql mysqlId={mysqlId} />
						<ResetMysql mysqlId={mysqlId} appName={data?.appName || ""} />
						{data?.applicationStatus === "idle" ? (
							<StartMysql mysqlId={mysqlId} />
						) : (
							<StopMysql mysqlId={mysqlId} />
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
