import { RefreshCcw } from "lucide-react";
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
import { api } from "@/utils/api";

interface Props {
	id: string;
	type: "application" | "compose";
}
export const RefreshToken = ({ id, type }: Props) => {
	const { mutateAsync } =
		type === "application"
			? api.application.refreshToken.useMutation()
			: api.compose.refreshToken.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger>
				<RefreshCcw className="h-4 w-4 cursor-pointer text-muted-foreground" />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will change the refresh token and
						other tokens will be invalidated.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								applicationId: id || "",
								composeId: id || "",
							})
								.then(() => {
									if (type === "application") {
										utils.application.one.invalidate({
											applicationId: id,
										});
									} else {
										utils.compose.one.invalidate({
											composeId: id,
										});
									}
									toast.success("Refresh updated");
								})
								.catch(() => {
									toast.error("Error updating the refresh token");
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
