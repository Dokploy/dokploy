import { Ban } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

interface Props {
	id: string;
	type: "application" | "compose";
}

export const CancelQueues = ({ id, type }: Props) => {
	const application = api.application.cleanQueues.useMutation();
	const compose = api.compose.cleanQueues.useMutation();
	const isPending = application.isPending || compose.isPending;

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" className="w-fit" isLoading={isPending}>
					Cancel queued deployments
					<Ban className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Cancel queued deployments?</AlertDialogTitle>
					<AlertDialogDescription>
						This cancels deployments currently waiting for this service. Running
						builds continue.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await (type === "application"
								? application.mutateAsync({ applicationId: id })
								: compose.mutateAsync({ composeId: id })
							)
								.then(() => {
									toast.success("Queued deployments cancelled");
								})
								.catch((err) => {
									toast.error(err.message);
								});
						}}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
