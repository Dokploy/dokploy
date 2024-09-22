import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Terminal } from "lucide-react";
import React from "react";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { StartMongo } from "../start-mongo";
import { DeployMongo } from "./deploy-mongo";
import { ResetMongo } from "./reset-mongo";
import { StopMongo } from "./stop-mongo";
interface Props {
	mongoId: string;
}

export const ShowGeneralMongo = ({ mongoId }: Props) => {
	const { data } = api.mongo.one.useQuery(
		{
			mongoId,
		},
		{ enabled: !!mongoId },
	);
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						<DeployMongo mongoId={mongoId} />
						<ResetMongo mongoId={mongoId} appName={data?.appName || ""} />
						{data?.applicationStatus === "idle" ? (
							<StartMongo mongoId={mongoId} />
						) : (
							<StopMongo mongoId={mongoId} />
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
