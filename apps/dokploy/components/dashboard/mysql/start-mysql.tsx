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
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
	mysqlId: string;
}

export const StartMysql = ({ mysqlId }: Props) => {
	const { mutateAsync, isLoading } = api.mysql.start.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="secondary" isLoading={isLoading}>
					Start
					<CheckCircle2 className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure to start the database?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This will start the database
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
									toast.success("Database started successfully");
								})
								.catch(() => {
									toast.error("Error starting the Database");
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
