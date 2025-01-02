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
	destinationId: string;
}
export const DeleteDestination = ({ destinationId }: Props) => {
	const { mutateAsync, isLoading } = api.destination.remove.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-red-500/10 "
					isLoading={isLoading}
				>
					<Trash2 className="size-4 text-primary group-hover:text-red-500" />
				</Button>
				{/* <Button variant="ghost" isLoading={isLoading}>
					<TrashIcon className="size-4  text-red-500" />
				</Button> */}
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete the
						destination
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								destinationId,
							})
								.then(() => {
									utils.destination.all.invalidate();
									toast.success("Destination deleted successfully");
								})
								.catch(() => {
									toast.error("Error deleting Destination");
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
