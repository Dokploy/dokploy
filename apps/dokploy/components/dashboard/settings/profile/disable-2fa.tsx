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
import { toast } from "sonner";
import { useTranslation } from "next-i18next";

export const Disable2FA = () => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const { mutateAsync, isLoading } = api.auth.disable2FA.useMutation();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" isLoading={isLoading}>
					{t("settings.profile.2fa.disable")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("settings.common.areYouSure")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("settings.profile.2fa.disable.description")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("settings.common.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync()
								.then(() => {
									utils.auth.get.invalidate();
									toast.success(t("settings.profile.2fa.disabled"));
								})
								.catch(() => {
									toast.error(t("settings.profile.2fa.disable.error"));
								});
						}}
					>
						{t("settings.common.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
