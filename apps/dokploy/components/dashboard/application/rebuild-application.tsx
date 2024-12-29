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
	applicationId: string;
}

export const RedbuildApplication = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const { mutateAsync } = api.application.redeploy.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="secondary"
					isLoading={data?.applicationStatus === "running"}
				>
					Rebuild
					<Hammer className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure to rebuild the application?
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
							toast.success("Redeploying Application....");
							await mutateAsync({
								applicationId,
							})
								.then(async () => {
									await utils.application.one.invalidate({
										applicationId,
									});
								})
								.catch(() => {
									toast.error("Error rebuilding the application");
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
