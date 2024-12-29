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
import React from "react";
import { toast } from "sonner";

interface Props {
	domainId: string;
}
export const DeleteDomain = ({ domainId }: Props) => {
	const { mutateAsync, isLoading } = api.domain.delete.useMutation();
	const utils = api.useUtils();
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
						domain
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								domainId,
							})
								.then((data) => {
									if (data?.applicationId) {
										utils.domain.byApplicationId.invalidate({
											applicationId: data?.applicationId,
										});
										utils.application.readTraefikConfig.invalidate({
											applicationId: data?.applicationId,
										});
									} else if (data?.composeId) {
										utils.domain.byComposeId.invalidate({
											composeId: data?.composeId,
										});
									}

									toast.success("Domain delete successfully");
								})
								.catch(() => {
									toast.error("Error deleting the Domain");
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
