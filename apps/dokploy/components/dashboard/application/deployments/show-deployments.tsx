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
import { type RouterOutputs, api } from "@/utils/api";
import { RocketIcon, Clock, Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { CancelQueues } from "./cancel-queues";
import { RefreshToken } from "./refresh-token";
import { ShowDeployment } from "./show-deployment";
import { Badge } from "@/components/ui/badge";

interface Props {
	id: string;
	type:
		| "application"
		| "compose"
		| "schedule"
		| "server"
		| "backup"
		| "previewDeployment";
	refreshToken?: string;
	serverId?: string;
}

export const formatDuration = (seconds: number) => {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
};

export const ShowDeployments = ({
	id,
	type,
	refreshToken,
	serverId,
}: Props) => {
	const [activeLog, setActiveLog] = useState<
		RouterOutputs["deployment"]["all"][number] | null
	>(null);
	const { data: deployments, isLoading: isLoadingDeployments } =
		api.deployment.allByType.useQuery(
			{
				id,
				type,
			},
			{
				enabled: !!id,
				refetchInterval: 1000,
			},
		);

	const [url, setUrl] = React.useState("");
	useEffect(() => {
		setUrl(document.location.origin);
	}, []);

	return (
		<Card className="bg-background border-none">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Deployments</CardTitle>
					<CardDescription>
						See all the 10 last deployments for this {type}
					</CardDescription>
				</div>
				{(type === "application" || type === "compose") && (
					<CancelQueues id={id} type={type} />
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{refreshToken && (
					<div className="flex flex-col gap-2 text-sm">
						<span>
							If you want to re-deploy this application use this URL in the
							config of your git provider or docker
						</span>
						<div className="flex flex-row items-center gap-2 flex-wrap">
							<span>Webhook URL: </span>
							<div className="flex flex-row items-center gap-2">
								<span className="break-all text-muted-foreground">
									{`${url}/api/deploy${type === 'compose' ? '/compose' : ''}/${refreshToken}`}
								</span>
								{(type === "application" || type === "compose") && (
									<RefreshToken id={id} type={type} />
								)}
							</div>
						</div>
					</div>
				)}

				{isLoadingDeployments ? (
					<div className="flex w-full flex-row items-center justify-center gap-3 pt-10 min-h-[25vh]">
						<Loader2 className="size-6 text-muted-foreground animate-spin" />
						<span className="text-base text-muted-foreground">
							Loading deployments...
						</span>
					</div>
				) : deployments?.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10 min-h-[25vh]">
						<RocketIcon className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No deployments found
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{deployments?.map((deployment, index) => (
							<div
								key={deployment.deploymentId}
								className="flex items-center justify-between rounded-lg border p-4 gap-2"
							>
								<div className="flex flex-col">
									<span className="flex items-center gap-4 font-medium capitalize text-foreground">
										{index + 1}. {deployment.status}
										<StatusTooltip
											status={deployment?.status}
											className="size-2.5"
										/>
									</span>
									<span className="text-sm text-muted-foreground">
										{deployment.title}
									</span>
									{deployment.description && (
										<span className="break-all text-sm text-muted-foreground">
											{deployment.description}
										</span>
									)}
								</div>
								<div className="flex flex-col items-end gap-2">
									<div className="text-sm capitalize text-muted-foreground flex items-center gap-2">
										<DateTooltip date={deployment.createdAt} />
										{deployment.startedAt && deployment.finishedAt && (
											<Badge
												variant="outline"
												className="text-[10px] gap-1 flex items-center"
											>
												<Clock className="size-3" />
												{formatDuration(
													Math.floor(
														(new Date(deployment.finishedAt).getTime() -
															new Date(deployment.startedAt).getTime()) /
															1000,
													),
												)}
											</Badge>
										)}
									</div>

									<Button
										onClick={() => {
											setActiveLog(deployment);
										}}
									>
										View
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
				<ShowDeployment
					serverId={serverId}
					open={Boolean(activeLog && activeLog.logPath !== null)}
					onClose={() => setActiveLog(null)}
					logPath={activeLog?.logPath || ""}
					errorMessage={activeLog?.errorMessage || ""}
				/>
			</CardContent>
		</Card>
	);
};
