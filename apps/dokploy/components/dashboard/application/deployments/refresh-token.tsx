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
import { api } from "@/utils/api";
import { RefreshCcw } from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";

interface Props {
	id: string;
	type: "application" | "compose";
}
export const RefreshToken = ({ id, type }: Props) => {
	const { t } = useTranslation("dashboard");
	const { mutateAsync } =
		type === "application"
			? api.application.refreshToken.useMutation()
			: api.compose.refreshToken.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger>
				<RefreshCcw className="h-4 w-4 cursor-pointer text-muted-foreground" />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("dashboard.deployments.areYouAbsolutelySure")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("dashboard.deployments.refreshTokenDescription")}
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
									if (type === "application") {
										utils.application.one.invalidate({
											applicationId: id,
										});
									} else {
										utils.compose.one.invalidate({
											composeId: id,
										});
									}
									toast.success(t("dashboard.deployments.refreshUpdated"));
								})
								.catch(() => {
									toast.error(
										t("dashboard.deployments.errorUpdatingRefreshToken"),
									);
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
