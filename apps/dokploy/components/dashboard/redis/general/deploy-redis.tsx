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
import { toast } from "sonner";

interface Props {
	redisId: string;
}

export const DeployRedis = ({ redisId }: Props) => {
	const { data, refetch } = api.redis.one.useQuery(
		{
			redisId,
		},
		{ enabled: !!redisId },
	);
	const { mutateAsync: deploy } = api.redis.deploy.useMutation();
	const { mutateAsync: changeStatus } = api.redis.changeStatus.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button isLoading={data?.applicationStatus === "running"}>
					Deploy
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This will deploy the redis database
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await changeStatus({
								redisId,
								applicationStatus: "running",
							})
								.then(async () => {
									toast.success("Deploying Database...");
									await refetch();
									await deploy({
										redisId,
									}).catch(() => {
										toast.error("Error deploying Database");
									});
									await refetch();
								})
								.catch((e) => {
									toast.error(e.message || "Error deploying Database");
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
