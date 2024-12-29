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
	mysqlId: string;
}

export const StopMysql = ({ mysqlId }: Props) => {
	const { mutateAsync, isLoading } = api.mysql.stop.useMutation();
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
					<AlertDialogTitle>
						Are you absolutely sure to stop the database?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This will stop the database
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								mysqlId,
							})
								.then(async () => {
									await utils.mysql.one.invalidate({
										mysqlId,
									});
									toast.success("MySQL stopped successfully");
								})
								.catch(() => {
									toast.error("Error stopping MySQL");
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
