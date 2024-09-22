import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import React from "react";

import { Terminal } from "lucide-react";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { StartRedis } from "../start-redis";
import { DeployRedis } from "./deploy-redis";
import { ResetRedis } from "./reset-redis";
import { StopRedis } from "./stop-redis";
interface Props {
	redisId: string;
}

export const ShowGeneralRedis = ({ redisId }: Props) => {
	const { data } = api.redis.one.useQuery(
		{
			redisId,
		},
		{ enabled: !!redisId },
	);

	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						<DeployRedis redisId={redisId} />
						<ResetRedis redisId={redisId} appName={data?.appName || ""} />
						{data?.applicationStatus === "idle" ? (
							<StartRedis redisId={redisId} />
						) : (
							<StopRedis redisId={redisId} />
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
