import {
	ClipboardList,
	Clock,
	Loader2,
	Play,
	Square,
	Terminal,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { ShowDeploymentsModal } from "../deployments/show-deployments-modal";
import { HandleSchedules } from "./handle-schedules";

interface Props {
	id: string;
	scheduleType?: "application" | "compose" | "server" | "dokploy-server";
}

export const ShowSchedules = ({ id, scheduleType = "application" }: Props) => {
	const [stoppingScheduleId, setStoppingScheduleId] = useState<string | null>(
		null,
	);
	const [runningScheduleId, setRunningScheduleId] = useState<string | null>(
		null,
	);

	const utils = api.useUtils();

	const {
		data: schedules,
		isLoading: isLoadingSchedules,
	} = api.schedule.list.useQuery(
		{
			id: id || "",
			scheduleType,
		},
		{
			enabled: !!id,
			refetchInterval: 3000, // Poll every 3 seconds to check for running status
			refetchOnWindowFocus: false,
		},
	);

	const { mutateAsync: deleteSchedule, isLoading: isDeleting } =
		api.schedule.delete.useMutation();

	const { mutateAsync: runManually } = api.schedule.runManually.useMutation();

	const { mutateAsync: stopSchedule } = api.schedule.stop.useMutation();

	return (
		<Card className="border px-6 shadow-none bg-transparent h-full min-h-[50vh]">
			<CardHeader className="px-0">
				<div className="flex justify-between items-center gap-y-2 flex-wrap">
					<div className="flex flex-col gap-2">
						<CardTitle className="text-xl font-bold flex items-center gap-2">
							Scheduled Tasks
						</CardTitle>
						<CardDescription>
							Schedule tasks to run automatically at specified intervals.
						</CardDescription>
					</div>
					{schedules && schedules.length > 0 && (
						<HandleSchedules id={id} scheduleType={scheduleType} />
					)}
				</div>
			</CardHeader>
			<CardContent className="px-0">
				{isLoadingSchedules ? (
					<div className="flex gap-4 w-full items-center justify-center text-center mx-auto min-h-[45vh]">
						<Loader2 className="size-4 text-muted-foreground/70 transition-colors animate-spin self-center" />
						<span className="text-sm text-muted-foreground/70">
							Loading scheduled tasks...
						</span>
					</div>
				) : schedules && schedules.length > 0 ? (
					<div className="grid xl:grid-cols-2 gap-4 grid-cols-1 h-full">
						{schedules.map((schedule) => {
							const serverId =
								schedule.serverId ||
								schedule.application?.serverId ||
								schedule.compose?.serverId;

							// Check if schedule has a running deployment
							const runningDeployment = schedule.deployments?.find(
								(deployment) => deployment.status === "running",
							);
							const isRunning = !!runningDeployment;

							return (
								<div
									key={schedule.scheduleId}
									className="flex flex-col sm:flex-row sm:items-center flex-wrap sm:flex-nowrap gap-y-2 justify-between rounded-lg border p-3 transition-colors bg-muted/50 w-full"
								>
									<div className="flex items-start gap-3 w-full sm:w-auto">
										<div className="flex flex-shrink-0 h-9 w-9 items-center justify-center rounded-full bg-primary/5">
											<Clock className="size-4 text-primary/70" />
										</div>
										<div className="space-y-1.5 w-full sm:w-auto">
											<div className="flex items-center gap-2 flex-wrap">
												<h3 className="text-sm font-medium leading-none [overflow-wrap:anywhere] line-clamp-3">
													{schedule.name}
												</h3>
												<Badge
													variant={schedule.enabled ? "default" : "secondary"}
													className="text-[10px] px-1 py-0"
												>
													{schedule.enabled ? "Enabled" : "Disabled"}
												</Badge>
												{isRunning && (
													<Badge
														variant="default"
														className="text-[10px] px-1 py-0 bg-green-500 hover:bg-green-600"
													>
														Running
													</Badge>
												)}
											</div>
											<div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
												<Badge
													variant="outline"
													className="font-mono text-[10px] bg-transparent"
												>
													Cron: {schedule.cronExpression}
												</Badge>
												{schedule.scheduleType !== "server" &&
													schedule.scheduleType !== "dokploy-server" && (
														<>
															<span className="text-xs text-muted-foreground/50">
																•
															</span>
															<Badge
																variant="outline"
																className="font-mono text-[10px] bg-transparent"
															>
																{schedule.shellType}
															</Badge>
														</>
													)}
											</div>
											{schedule.command && (
												<div className="flex items-start gap-2 max-w-full">
													<Terminal className="size-3.5 text-muted-foreground/70 flex-shrink-0 mt-0.5" />
													<code className="font-mono text-[10px] text-muted-foreground/70 break-all max-w-[calc(100%-20px)]">
														{schedule.command}
													</code>
												</div>
											)}
										</div>
									</div>
									<div className="flex items-center gap-0.5 md:gap-1.5">
										<ShowDeploymentsModal
											id={schedule.scheduleId}
											type="schedule"
											serverId={serverId || undefined}
										>
											<Button variant="ghost" size="icon">
												<ClipboardList className="size-4 transition-colors" />
											</Button>
										</ShowDeploymentsModal>

										{isRunning || stoppingScheduleId === schedule.scheduleId ? (
											<TooltipProvider delayDuration={0}>
												<Tooltip>
													<TooltipTrigger asChild>
														<DialogAction
															title="Stop Running Schedule"
															description="Are you sure you want to stop this running schedule? The current execution will be interrupted."
															type="default"
															onClick={async () => {
																const scheduleId = schedule.scheduleId;
																setStoppingScheduleId(scheduleId);
																try {
																	await stopSchedule({
																		scheduleId,
																	});
																	// Clear loading state immediately - this triggers a re-render
																	setStoppingScheduleId(null);
																	toast.success("Schedule stopped successfully");
																	// Invalidate in background without awaiting
																	utils.schedule.list.invalidate({
																		id,
																		scheduleType,
																	}).catch(() => {
																		// Silently handle background refetch errors
																	});
																} catch (error) {
																	// Clear loading on error too
																	setStoppingScheduleId(null);
																	toast.error(
																		error instanceof Error
																			? error.message
																			: "Error stopping schedule",
																	);
																}
															}}
														>
															<Button
																type="button"
																variant="destructive"
																size="icon"
																isLoading={
																	stoppingScheduleId === schedule.scheduleId
																}
															>
																<Square className="size-4" />
															</Button>
														</DialogAction>
													</TooltipTrigger>
													<TooltipContent>Stop Running Schedule</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										) : (
											<TooltipProvider delayDuration={0}>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															type="button"
															variant="ghost"
															size="icon"
															isLoading={
																runningScheduleId === schedule.scheduleId
															}
															onClick={async () => {
																setRunningScheduleId(schedule.scheduleId);
																try {
																	await runManually({
																		scheduleId: schedule.scheduleId,
																	});
																	// Clear loading immediately
																	setRunningScheduleId(null);
																	toast.success("Schedule run successfully");
																	// Invalidate in background without awaiting
																	utils.schedule.list.invalidate({
																		id,
																		scheduleType,
																	}).catch(() => {
																		// Silently handle background refetch errors
																	});
																} catch (error) {
																	setRunningScheduleId(null);
																	toast.error(
																		error instanceof Error
																			? error.message
																			: "Error running schedule",
																	);
																}
															}}
														>
															<Play className="size-4  transition-colors" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Run Manual Schedule</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										)}
										<HandleSchedules
											scheduleId={schedule.scheduleId}
											id={id}
											scheduleType={scheduleType}
										/>
										<DialogAction
											title="Delete Schedule"
											description="Are you sure you want to delete this schedule?"
											type="destructive"
											onClick={async () => {
												await deleteSchedule({
													scheduleId: schedule.scheduleId,
												})
													.then(() => {
														utils.schedule.list.invalidate({
															id,
															scheduleType,
														});
														toast.success("Schedule deleted successfully");
													})
													.catch(() => {
														toast.error("Error deleting schedule");
													});
											}}
										>
											<Button
												variant="ghost"
												size="icon"
												className="group hover:bg-red-500/10"
												disabled={isDeleting}
											>
												<Trash2 className="size-4 text-primary group-hover:text-red-500" />
											</Button>
										</DialogAction>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex flex-col gap-2 items-center justify-center py-12 rounded-lg">
						<Clock className="size-8 mb-4 text-muted-foreground" />
						<p className="text-lg font-medium text-muted-foreground">
							No scheduled tasks
						</p>
						<p className="text-sm text-muted-foreground mt-1">
							Create your first scheduled task to automate your workflows
						</p>
						<HandleSchedules id={id} scheduleType={scheduleType} />
					</div>
				)}
			</CardContent>
		</Card>
	);
};
