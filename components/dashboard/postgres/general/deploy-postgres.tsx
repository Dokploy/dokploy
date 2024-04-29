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
	postgresId: string;
}

export const DeployPostgres = ({ postgresId }: Props) => {
	const { data, refetch } = api.postgres.one.useQuery(
		{
			postgresId,
		},
		{ enabled: !!postgresId },
	);
	const { mutateAsync: deploy } = api.postgres.deploy.useMutation();
	const { mutateAsync: changeStatus } = api.postgres.changeStatus.useMutation();

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
						This will deploy the postgres database
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await changeStatus({
								postgresId,
								applicationStatus: "running",
							})
								.then(async () => {
									toast.success("Database Deploying....");
									await refetch();
									await deploy({
										postgresId,
									})
										.then(() => {
											toast.success("Database Deployed Succesfully");
										})
										.catch(() => {
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
