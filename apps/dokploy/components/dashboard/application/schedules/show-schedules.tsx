import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { useState } from "react";
import { HandleSchedules } from "./handle-schedules";
import { PlusCircle, Clock, Terminal, Trash2, Edit2 } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
	applicationId: string;
}

export const ShowSchedules = ({ applicationId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<{
		scheduleId: string;
		name: string;
		cronExpression: string;
		command: string;
	} | null>(null);

	const { data: schedules } = api.schedule.list.useQuery({
		applicationId,
	});

	const { mutate: deleteSchedule } = api.schedule.delete.useMutation({
		onSuccess: () => {
			utils.schedule.list.invalidate({ applicationId });
		},
	});

	const utils = api.useContext();

	const onClose = () => {
		setIsOpen(false);
		setEditingSchedule(null);
	};

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

					<Dialog open={isOpen} onOpenChange={setIsOpen}>
						<DialogTrigger asChild>
							<Button className="gap-2">
								<PlusCircle className="w-4 h-4" />
								New Schedule
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>
									{editingSchedule ? "Edit" : "Create"} Schedule
								</DialogTitle>
							</DialogHeader>
							<HandleSchedules
								applicationId={applicationId}
								onSuccess={onClose}
								defaultValues={editingSchedule || undefined}
								scheduleId={editingSchedule?.scheduleId}
							/>
						</DialogContent>
					</Dialog>
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
									<TableHead>Command</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{schedules.map((schedule) => (
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
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														setEditingSchedule(schedule);
														setIsOpen(true);
													}}
												>
													<Edit2 className="w-4 h-4" />
													<span className="sr-only">Edit</span>
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="text-destructive hover:text-destructive"
													onClick={() =>
														deleteSchedule({ scheduleId: schedule.scheduleId })
													}
												>
													<Trash2 className="w-4 h-4" />
													<span className="sr-only">Delete</span>
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
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
