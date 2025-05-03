import { DateTooltip } from "@/components/shared/date-tooltip";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

import type { RouterOutputs } from "@/utils/api";
import { useState } from "react";
import { ShowDeployment } from "../deployments/show-deployment";
import { ClipboardList, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
	deployments: RouterOutputs["deployment"]["all"];
	serverId?: string;
	children?: React.ReactNode;
}

export const formatDuration = (seconds: number) => {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
};

export const ShowSchedulesLogs = ({
	deployments,
	serverId,
	children,
}: Props) => {
	const [activeLog, setActiveLog] = useState<
		RouterOutputs["deployment"]["all"][number] | null
	>(null);
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{children ? (
					children
				) : (
					<Button className="sm:w-auto w-full" size="sm" variant="outline">
						View Logs
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>Logs</DialogTitle>
					<DialogDescription>
						See all the logs for this schedule
					</DialogDescription>
				</DialogHeader>
				{deployments.length > 0 ? (
					<div className="grid gap-4">
						{deployments.map((deployment, index) => (
							<div
								key={deployment.deploymentId}
								className="flex items-center justify-between rounded-lg border p-4 gap-2"
							>
								<div className="flex flex-col">
									<span className="flex items-center gap-4 font-medium capitalize text-foreground">
										{index + 1} {deployment.status}
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
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
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
				) : (
					<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
						<ClipboardList className="size-12 mb-4" />
						<p className="text-lg font-medium">No logs found</p>
						<p className="text-sm">This schedule hasn't been executed yet</p>
					</div>
				)}
			</DialogContent>
			<ShowDeployment
				serverId={serverId || ""}
				open={Boolean(activeLog && activeLog.logPath !== null)}
				onClose={() => setActiveLog(null)}
				logPath={activeLog?.logPath || ""}
				errorMessage={activeLog?.errorMessage || ""}
			/>
		</Dialog>
	);
};
