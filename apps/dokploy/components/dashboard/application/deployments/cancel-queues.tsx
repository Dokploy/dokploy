import { Ban } from "lucide-react";
import { useTranslation } from "react-i18next";
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

export const CancelQueues = ({ id, type }: Props) => {
	const { t } = useTranslation();
	const { mutateAsync, isPending } =
		type === "application"
			? api.application.cleanQueues.useMutation()
			: api.compose.cleanQueues.useMutation();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	if (isCloud) {
		return null;
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" className="w-fit" isLoading={isPending}>
					{t("application.deployments.cancelQueues")}
					<Ban className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("application.deployments.cancelQueuesTitle")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("application.deployments.cancelQueuesDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						{t("application.deployments.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								applicationId: id || "",
								composeId: id || "",
							})
								.then(() => {
									toast.success(t("application.deployments.queuesCleaning"));
								})
								.catch((err) => {
									toast.error(err.message);
								});
						}}
					>
						{t("application.deployments.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
