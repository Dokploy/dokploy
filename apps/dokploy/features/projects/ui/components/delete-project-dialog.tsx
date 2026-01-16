import { AlertTriangle, TrashIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deleteProjectUseCase } from "../../application/use-cases/delete-project.use-case";
import { useProjectsRepository } from "../../infrastructure/api/projects-api.repository";

interface Props {
	projectId: string;
	emptyServices: boolean;
}

/**
 * Delete project dialog component.
 */
export const DeleteProjectDialog = ({ projectId, emptyServices }: Props) => {
	const [isDeleting, setIsDeleting] = useState(false);
	const projectsRepository = useProjectsRepository();

	const handleDelete = useCallback(async () => {
		try {
			setIsDeleting(true);
			
			await deleteProjectUseCase(
				projectId,
				projectsRepository
			);
			
			toast.success("Project deleted successfully");
		} catch (error) {
			toast.error("Error deleting this project");
		} finally {
			setIsDeleting(false);
		}
	}, [projectId, projectsRepository]);

	return (
		<AlertDialog>
			<AlertDialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<TrashIcon className="size-4" />
					<span>Delete</span>
				</DropdownMenuItem>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure to delete this project?
					</AlertDialogTitle>
					{!emptyServices ? (
						<div className="flex flex-row gap-4 rounded-lg bg-yellow-50 p-2 dark:bg-yellow-950">
							<AlertTriangle className="text-yellow-600 dark:text-yellow-400" />
							<span className="text-sm text-yellow-600 dark:text-yellow-400">
								You have active services, please delete them first
							</span>
						</div>
					) : (
						<AlertDialogDescription>
							This action cannot be undone
						</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={!emptyServices || isDeleting}
						onClick={handleDelete}
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};