import { Scissors } from "lucide-react";
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

export const KillBuild = ({ id, type }: Props) => {
	const { t } = useTranslation();
	const { mutateAsync, isPending } =
		type === "application"
			? api.application.killBuild.useMutation()
			: api.compose.killBuild.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="outline" className="w-fit" isLoading={isPending}>
					{t("application.deployments.killBuild")}
					<Scissors className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("application.deployments.killBuildTitle")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("application.deployments.killBuildDescription")}
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
									toast.success(t("application.deployments.buildKilled"));
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
