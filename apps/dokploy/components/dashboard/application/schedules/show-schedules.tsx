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
		<div className="space-y-4">
			<div className="flex justify-between items-center">
				<h2 className="text-2xl font-bold">Schedules</h2>
				<Dialog open={isOpen} onOpenChange={setIsOpen}>
					<DialogTrigger asChild>
						<Button>Create Schedule</Button>
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

			{schedules && schedules.length > 0 ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Cron Expression</TableHead>
							<TableHead>Command</TableHead>
							<TableHead>Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{schedules.map((schedule) => (
							<TableRow key={schedule.scheduleId}>
								<TableCell>{schedule.name}</TableCell>
								<TableCell>{schedule.cronExpression}</TableCell>
								<TableCell>{schedule.command}</TableCell>
								<TableCell className="space-x-2">
									<Button
										variant="outline"
										onClick={() => {
											setEditingSchedule(schedule);
											setIsOpen(true);
										}}
									>
										Edit
									</Button>
									<Button
										variant="destructive"
										onClick={() =>
											deleteSchedule({ scheduleId: schedule.scheduleId })
										}
									>
										Delete
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : (
				<div className="text-center text-gray-500">No schedules found</div>
			)}
		</div>
	);
};
