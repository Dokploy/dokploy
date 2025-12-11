import { Scissors } from "lucide-react";
import { useTranslation } from "next-i18next";
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

export const KillBuild = ({ id, type }: Props) => {
	const { t } = useTranslation("common");
	const { mutateAsync, isLoading } =
		type === "application"
			? api.application.killBuild.useMutation()
			: api.compose.killBuild.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="outline" className="w-fit" isLoading={isLoading}>
					{t("deployments.killBuild.button.open")}
					<Scissors className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("deployments.killBuild.dialog.title")}</AlertDialogTitle>
					<AlertDialogDescription>{t("deployments.killBuild.dialog.description")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("button.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								applicationId: id || "",
								composeId: id || "",
							})
								.then(() => {
									toast.success(t("deployments.killBuild.toast.success"));
								})
								.catch((err) => {
									toast.error(err.message);
								});
						}}
					>
						{t("deployments.killBuild.button.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
