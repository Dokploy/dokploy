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
import { Hammer } from "lucide-react";
import { toast } from "sonner";

interface Props {
	composeId: string;
}

export const RedbuildCompose = ({ composeId }: Props) => {
	const { data } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);
	const { mutateAsync } = api.compose.redeploy.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="secondary"
					isLoading={data?.composeStatus === "running"}
				>
					Rebuild
					<Hammer className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure to rebuild the compose?
					</AlertDialogTitle>
					<AlertDialogDescription>
						Is required to deploy at least 1 time in order to reuse the same
						code
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							toast.success("Redeploying Compose....");
							await mutateAsync({
								composeId,
							})
								.then(async () => {
									await utils.compose.one.invalidate({
										composeId,
									});
								})
								.catch(() => {
									toast.error("Error rebuilding the compose");
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
