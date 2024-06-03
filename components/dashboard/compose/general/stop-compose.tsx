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
import { Ban } from "lucide-react";
import { toast } from "sonner";

interface Props {
	composeId: string;
}

export const StopCompose = ({ composeId }: Props) => {
	const { data } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);
	const { mutateAsync: markRunning } = api.compose.update.useMutation();
	const { mutateAsync, isLoading } = api.compose.stop.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" isLoading={isLoading}>
					Stop
					<Ban className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you sure to stop the compose?</AlertDialogTitle>
					<AlertDialogDescription>
						This will stop the compose services
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await markRunning({
								composeId,
								composeStatus: "running",
							})
								.then(async () => {
									await mutateAsync({
										composeId,
									})
										.then(async () => {
											await utils.compose.one.invalidate({
												composeId,
											});
											toast.success("Compose rebuild succesfully");
										})
										.catch(() => {
											toast.error("Error to rebuild the compose");
										});
								})
								.catch(() => {
									toast.error("Error to rebuild the compose");
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
