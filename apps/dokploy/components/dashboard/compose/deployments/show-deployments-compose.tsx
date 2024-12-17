import { DateTooltip } from "@/components/shared/date-tooltip";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { RocketIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { CancelQueuesCompose } from "./cancel-queues-compose";
import { RefreshTokenCompose } from "./refresh-token-compose";
import { ShowDeploymentCompose } from "./show-deployment-compose";

interface Props {
	composeId: string;
}
export const ShowDeploymentsCompose = ({ composeId }: Props) => {
	const [activeLog, setActiveLog] = useState<string | null>(null);
	const { data } = api.compose.one.useQuery({ composeId });
	const { data: deployments } = api.deployment.allByCompose.useQuery(
		{ composeId },
		{
			enabled: !!composeId,
			refetchInterval: 5000,
		},
	);
	const [url, setUrl] = React.useState("");
	useEffect(() => {
		setUrl(document.location.origin);
	}, []);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Deployments</CardTitle>
					<CardDescription>
						See all the 10 last deployments for this compose
					</CardDescription>
				</div>
				<CancelQueuesCompose composeId={composeId} />
				{/* <CancelQueues applicationId={applicationId} /> */}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-col gap-2 text-sm">
					<span>
						If you want to re-deploy this application use this URL in the config
						of your git provider or docker
					</span>
					<div className="flex flex-row items-center gap-2 flex-wrap">
						<span>Webhook URL: </span>
						<div className="flex flex-row items-center gap-2">
							<span className="text-muted-foreground">
								{`${url}/api/deploy/compose/${data?.refreshToken}`}
							</span>
							<RefreshTokenCompose composeId={composeId} />
						</div>
					</div>
				</div>
				{data?.deployments?.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<RocketIcon className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No deployments found
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{deployments?.map((deployment) => (
							<div
								key={deployment.deploymentId}
								className="flex items-center justify-between rounded-lg border p-4"
							>
								<div className="flex flex-col">
									<span className="flex items-center gap-4 font-medium capitalize text-foreground">
										{deployment.status}

										<StatusTooltip
											status={deployment?.status}
											className="size-2.5"
										/>
									</span>
									<span className="text-sm text-muted-foreground">
										{deployment.title}
									</span>
									{deployment.description && (
										<span className="text-sm text-muted-foreground">
											{deployment.description}
										</span>
									)}
								</div>
								<div className="flex flex-col items-end gap-2">
									<div className="text-sm capitalize text-muted-foreground">
										<DateTooltip date={deployment.createdAt} />
									</div>

									<Button
										onClick={() => {
											setActiveLog(deployment.logPath);
										}}
									>
										View
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
				<ShowDeploymentCompose
					serverId={data?.serverId || ""}
					open={activeLog !== null}
					onClose={() => setActiveLog(null)}
					logPath={activeLog}
				/>
			</CardContent>
		</Card>
	);
};
