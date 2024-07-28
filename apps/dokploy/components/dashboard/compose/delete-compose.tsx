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
} from "@dokploy/components/ui/alert-dialog";
import { Button } from "@dokploy/components/ui/button";
import { api } from "@dokploy/utils/api";
import { TrashIcon } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "sonner";

interface Props {
	composeId: string;
}

export const DeleteCompose = ({ composeId }: Props) => {
	const { mutateAsync, isLoading } = api.compose.delete.useMutation();
	const { push } = useRouter();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" isLoading={isLoading}>
					<TrashIcon className="size-4 text-muted-foreground" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete the
						compose and all its services.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								composeId,
							})
								.then((data) => {
									push(`/dashboard/project/${data?.projectId}`);

									toast.success("Compose delete succesfully");
								})
								.catch(() => {
									toast.error("Error to delete the compose");
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
