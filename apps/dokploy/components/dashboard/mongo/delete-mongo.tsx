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
	mongoId: string;
}

export const DeleteMongo = ({ mongoId }: Props) => {
	const { mutateAsync, isLoading } = api.mongo.remove.useMutation();
	const { push } = useRouter();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" isLoading={isLoading}>
					<TrashIcon className="size-4  text-muted-foreground " />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete the
						database
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								mongoId,
							})
								.then((data) => {
									push(`/dashboard/project/${data?.projectId}`);
									toast.success("Database delete succesfully");
								})
								.catch(() => {
									toast.error("Error to delete the database");
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
