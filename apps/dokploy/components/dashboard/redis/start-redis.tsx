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
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
	redisId: string;
}

export const StartRedis = ({ redisId }: Props) => {
	const { mutateAsync, isLoading } = api.redis.start.useMutation();
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
								redisId,
							})
								.then(async () => {
									await utils.redis.one.invalidate({
										redisId,
									});
									toast.success("Database started succesfully");
								})
								.catch(() => {
									toast.error("Error to start the Database");
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
