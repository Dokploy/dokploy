import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { HandleSchedules } from "./handle-schedules";
import { Clock, Play, Terminal, Trash2 } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShowSchedulesLogs } from "./show-schedules-logs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DialogAction } from "@/components/shared/dialog-action";

interface Props {
	applicationId: string;
}

export const ShowSchedules = ({ applicationId }: Props) => {
	const { data: schedules } = api.schedule.list.useQuery({
		applicationId,
	});
	const utils = api.useUtils();

	const { mutateAsync: deleteSchedule, isLoading: isDeleting } =
		api.schedule.delete.useMutation();

	const { mutateAsync: runManually, isLoading } =
		api.schedule.runManually.useMutation();

	return (
		<Card className="border px-4 shadow-none bg-transparent">
			<CardHeader className="px-0">
				<div className="flex  justify-between items-center">
					<div className="flex flex-col gap-2">
						<CardTitle className="text-xl font-bold flex items-center gap-2">
							Scheduled Tasks
						</CardTitle>
						<CardDescription>
							Schedule tasks to run automatically at specified intervals.
						</CardDescription>
					</div>

					{schedules && schedules.length > 0 && (
						<HandleSchedules applicationId={applicationId} />
					)}
				</div>
			</CardHeader>
			<CardContent className="px-0">
				{schedules && schedules.length > 0 ? (
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Task Name</TableHead>
									<TableHead>Schedule</TableHead>
									<TableHead>Shell</TableHead>
									<TableHead>Command</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{schedules.map((schedule) => {
									const application = schedule.application;
									const deployments = schedule.deployments;
									return (
										<TableRow key={schedule.scheduleId}>
											<TableCell className="font-medium">
												{schedule.name}
											</TableCell>
											<TableCell>
												<Badge variant="secondary" className="font-mono">
													{schedule.cronExpression}
												</Badge>
											</TableCell>
											<TableCell>
												<Badge variant="secondary" className="font-mono">
													{schedule.shellType}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
													<Terminal className="w-4 h-4 text-muted-foreground" />
													<code className="bg-muted px-2 py-1 rounded text-sm">
														{schedule.command}
													</code>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant={schedule.enabled ? "default" : "secondary"}
												>
													{schedule.enabled ? "Enabled" : "Disabled"}
												</Badge>
											</TableCell>
											<TableCell className="text-right">
												<div className="flex justify-end gap-2">
													<ShowSchedulesLogs
														deployments={deployments || []}
														serverId={application.serverId || undefined}
													/>

													<TooltipProvider delayDuration={0}>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	type="button"
																	variant="ghost"
																	isLoading={isLoading}
																	onClick={async () => {
																		await runManually({
																			scheduleId: schedule.scheduleId,
																		})
																			.then(() => {
																				toast.success(
																					"Schedule run successfully",
																				);
																				utils.schedule.list.invalidate({
																					applicationId,
																				});
																			})
																			.catch((error) => {
																				console.log(error);
																				toast.error(
																					error instanceof Error
																						? error.message
																						: "Error running schedule",
																				);
																			});
																	}}
																>
																	<Play className="size-4" />
																</Button>
															</TooltipTrigger>
															<TooltipContent>
																Run Manual Schedule
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<HandleSchedules
														scheduleId={schedule.scheduleId}
														applicationId={applicationId}
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
																		applicationId,
																	});
																	toast.success(
																		"Schedule deleted successfully",
																	);
																})
																.catch(() => {
																	toast.error("Error deleting schedule");
																});
														}}
													>
														<Button
															variant="ghost"
															size="icon"
															className="group hover:bg-red-500/10 "
															isLoading={isDeleting}
														>
															<Trash2 className="size-4 text-primary group-hover:text-red-500" />
														</Button>
													</DialogAction>
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				) : (
					<div className="flex flex-col gap-2 items-center justify-center py-12 border rounded-lg">
						<Clock className="size-8 mb-4 text-muted-foreground" />
						<p className="text-lg font-medium text-muted-foreground">
							No scheduled tasks
						</p>
						<p className="text-sm text-muted-foreground mt-1">
							Create your first scheduled task to automate your workflows
						</p>
						<HandleSchedules applicationId={applicationId} />
					</div>
				)}
			</CardContent>
		</Card>
	);
};
