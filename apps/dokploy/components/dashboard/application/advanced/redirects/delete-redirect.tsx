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
import { toast } from "sonner";

interface Props {
	redirectId: string;
}

export const DeleteRedirect = ({ redirectId }: Props) => {
	const utils = api.useUtils();
	const { mutateAsync, isLoading } = api.redirects.delete.useMutation();
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
						redirect
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								redirectId,
							})
								.then((data) => {
									utils.application.one.invalidate({
										applicationId: data?.applicationId,
									});
									utils.application.readTraefikConfig.invalidate({
										applicationId: data?.applicationId,
									});
									toast.success("Redirect delete succesfully");
								})
								.catch(() => {
									toast.error("Error to delete the redirect");
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
