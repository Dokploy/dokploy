import { RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { api } from "@/utils/api";

interface Props {
	id: string;
	type: "application" | "compose";
}
export const RefreshToken = ({ id, type }: Props) => {
	const t = useTranslations("applicationDeployments");
	const tCommon = useTranslations("common");
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
					<AlertDialogTitle>{t("refreshToken.title")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("refreshToken.description")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
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
									toast.success(t("refreshToken.success"));
								})
								.catch(() => {
									toast.error(t("refreshToken.error"));
								});
						}}
					>
						{tCommon("confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
