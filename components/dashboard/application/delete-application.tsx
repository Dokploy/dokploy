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
import { TrashIcon } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "sonner";

interface Props {
	applicationId: string;
}

export const DeleteApplication = ({ applicationId }: Props) => {
	const { mutateAsync, isLoading } = api.application.delete.useMutation();
	const { push } = useRouter();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" isLoading={isLoading}>
					<TrashIcon className="size-4 " />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete the
						application
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								applicationId,
							})
								.then((data) => {
									push(`/dashboard/project/${data?.projectId}`);

									toast.success("Application delete succesfully");
								})
								.catch(() => {
									toast.error("Error to delete Application");
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
