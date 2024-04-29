import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

import { StopRedis } from "./stop-redis";
import { StartRedis } from "../start-redis";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { Terminal } from "lucide-react";
import { DeployRedis } from "./deploy-redis";
import { ResetRedis } from "./reset-redis";
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

						<DockerTerminalModal appName={data?.appName || ""}>
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
