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
import { Trash2 } from "lucide-react";
import React from "react";
import { toast } from "sonner";

interface Props {
	notificationId: string;
}
export const DeleteNotification = ({ notificationId }: Props) => {
	const { mutateAsync, isLoading } = api.notification.remove.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-9 w-9 group hover:bg-red-500/10"
					isLoading={isLoading}
				>
					<Trash2 className="size-4 text-muted-foreground group-hover:text-red-500" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete the
						notification
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								notificationId,
							})
								.then(() => {
									utils.notification.all.invalidate();
									toast.success("Notification delete succesfully");
								})
								.catch(() => {
									toast.error("Error to delete notification");
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
