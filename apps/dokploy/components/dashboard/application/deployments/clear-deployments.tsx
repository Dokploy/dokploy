import { Paintbrush } from "lucide-react";
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

export const ClearDeployments = ({ id, type }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const { mutateAsync, isPending } =
		type === "application"
			? api.application.clearDeployments.useMutation()
			: api.compose.clearDeployments.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="outline" className="w-fit" isLoading={isPending}>
					{t("application.deployments.clearDeployments")}
					<Paintbrush className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("application.deployments.clearDeploymentsTitle")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("application.deployments.clearDeploymentsDescription")}
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
								.then(async () => {
									toast.success(t("application.deployments.cleared"));
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
						{t("application.deployments.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
