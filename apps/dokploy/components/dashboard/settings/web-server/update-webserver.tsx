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
import { useTranslation } from "next-i18next";
import { toast } from "sonner";

export const UpdateWebServer = () => {
	const { t } = useTranslation("settings");
	const { mutateAsync: updateServer, isLoading } =
		api.settings.updateServer.useMutation();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					className="relative w-full"
					variant="secondary"
					isLoading={isLoading}
				>
					<span className="absolute -right-1 -top-2 flex h-3 w-3">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
						<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
					</span>
					{t("settings.server.webServer.updates.updateServer")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("settings.common.areYouSure")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("settings.server.webServer.updates.updateServerDescription")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("settings.common.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await updateServer();
							toast.success(
								t("settings.server.webServer.updates.pleaseReload"),
							);
						}}
					>
						{t("settings.common.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
