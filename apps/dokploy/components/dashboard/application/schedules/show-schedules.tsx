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
import { Clock, Terminal, Trash2 } from "lucide-react";
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

interface Props {
	applicationId: string;
}

export const ShowSchedules = ({ applicationId }: Props) => {
	const { data: schedules } = api.schedule.list.useQuery({
		applicationId,
	});

	const { mutate: deleteSchedule } = api.schedule.delete.useMutation({
		onSuccess: () => {
			utils.schedule.list.invalidate({ applicationId });
		},
	});

	const { mutateAsync: runManually } = api.schedule.runManually.useMutation({
		onSuccess: () => {
			utils.schedule.list.invalidate({ applicationId });
		},
	});

	const utils = api.useContext();

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

					<HandleSchedules applicationId={applicationId} />
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
													<Button
														variant="ghost"
														size="sm"
														onClick={async () => {
															await runManually({
																scheduleId: schedule.scheduleId,
															})
																.then(() => {
																	toast.success("Schedule run successfully");
																})
																.catch((error) => {
																	toast.error(
																		error instanceof Error
																			? error.message
																			: "Error running schedule",
																	);
																});
														}}
													>
														Run Manual Schedule
													</Button>

													<HandleSchedules
														scheduleId={schedule.scheduleId}
														applicationId={applicationId}
													/>

													<Button
														variant="ghost"
														size="sm"
														className="text-destructive hover:text-destructive"
														onClick={() =>
															deleteSchedule({
																scheduleId: schedule.scheduleId,
															})
														}
													>
														<Trash2 className="w-4 h-4" />
														<span className="sr-only">Delete</span>
													</Button>
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				) : (
					<div className="flex flex-row gap-4 items-center justify-center py-12 border rounded-lg">
						<Clock className="size-6 text-muted-foreground" />
						<p className="text-muted-foreground text-center">
							No scheduled tasks found
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
