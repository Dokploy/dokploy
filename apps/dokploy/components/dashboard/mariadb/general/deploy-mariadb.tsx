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
import { toast } from "sonner";

interface Props {
	mariadbId: string;
}

export const DeployMariadb = ({ mariadbId }: Props) => {
	const { data, refetch } = api.mariadb.one.useQuery(
		{
			mariadbId,
		},
		{ enabled: !!mariadbId },
	);
	const { mutateAsync: deploy } = api.mariadb.deploy.useMutation();
	const { mutateAsync: changeStatus } = api.mariadb.changeStatus.useMutation();

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
						This will deploy the mariadb database
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await changeStatus({
								mariadbId,
								applicationStatus: "running",
							})
								.then(async () => {
									toast.success("Deploying Database....");
									await refetch();
									await deploy({
										mariadbId,
									}).catch(() => {
										toast.error("Error to deploy Database");
									});
									await refetch();
								})
								.catch((e) => {
									toast.error(e.message || "Error to deploy Database");
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
