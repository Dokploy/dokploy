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
	composeId: string;
}

export const DeployCompose = ({ composeId }: Props) => {
	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);

	const { mutateAsync: markRunning } = api.compose.update.useMutation();
	const { mutateAsync: deploy } = api.compose.deploy.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button isLoading={data?.composeStatus === "running"}>Deploy</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This will deploy the compose
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
									toast.success("Compose Deploying....");

									await refetch();
									await deploy({
										composeId,
									})
										.then(() => {
											toast.success("Compose Deployed Succesfully");
										})
										.catch(() => {
											toast.error("Error to deploy Compose");
										});

									await refetch();
								})
								.catch((e) => {
									toast.error(e.message || "Error to deploy Compose");
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
