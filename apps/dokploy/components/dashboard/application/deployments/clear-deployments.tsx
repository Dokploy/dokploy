import { Paintbrush } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

interface Props {
	id: string;
	type: "application" | "compose";
}

export const ClearDeployments = ({ id, type }: Props) => {
	const utils = api.useUtils();
	const { mutateAsync, isLoading } =
		type === "application"
			? api.application.clearDeployments.useMutation()
			: api.compose.clearDeployments.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="outline" className="w-fit" isLoading={isLoading}>
					Clear deployments
					<Paintbrush className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure you want to clear old deployments?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This will delete all old deployment records and logs, keeping only
						the active deployment (the most recent successful one).
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
								.then(async () => {
									toast.success("Old deployments cleared successfully");
									await utils.deployment.allByType.invalidate({
										id,
										type: type as "application" | "compose",
									});
								})
								.catch((err) => {
									toast.error(err.message);
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
