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
import { Paintbrush } from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";

interface Props {
	id: string;
	type: "application" | "compose";
}

export const CancelQueues = ({ id, type }: Props) => {
	const { t } = useTranslation("dashboard");
	const { mutateAsync, isLoading } =
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
				<Button variant="destructive" className="w-fit" isLoading={isLoading}>
					{t("dashboard.deployments.cancelQueues")}
					<Paintbrush className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("dashboard.deployments.cancelQueuesConfirmation")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("dashboard.deployments.cancelQueuesDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						{t("dashboard.deployments.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								applicationId: id || "",
								composeId: id || "",
							})
								.then(() => {
									toast.success(t("dashboard.deployments.queuesBeingCleaned"));
								})
								.catch((err) => {
									toast.error(err.message);
								});
						}}
					>
						{t("dashboard.deployments.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
