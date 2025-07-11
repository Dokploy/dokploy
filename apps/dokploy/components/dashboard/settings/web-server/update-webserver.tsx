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
import { HardDriveDownload, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { toast } from "sonner";

export const UpdateWebServer = () => {
	const { t } = useTranslation("settings");
	const [updating, setUpdating] = useState(false);
	const [open, setOpen] = useState(false);

	const { mutateAsync: updateServer } = api.settings.updateServer.useMutation();

	const checkIsUpdateFinished = async () => {
		try {
			const response = await fetch("/api/health");
			if (!response.ok) {
				throw new Error("Health check failed");
			}

			toast.success(t("settings.webServer.updateWebServer.updated"));

			setTimeout(() => {
				// Allow seeing the toast before reloading
				window.location.reload();
			}, 2000);
		} catch {
			// Delay each request
			await new Promise((resolve) => setTimeout(resolve, 2000));
			// Keep running until it returns 200
			void checkIsUpdateFinished();
		}
	};

	const handleConfirm = async () => {
		try {
			setUpdating(true);
			await updateServer();

			// Give some time for docker service restart before starting to check status
			await new Promise((resolve) => setTimeout(resolve, 8000));

			await checkIsUpdateFinished();
		} catch (error) {
			setUpdating(false);
			console.error("Error updating server:", error);
			toast.error(t("settings.webServer.updateWebServer.error"));
		}
	};

	return (
		<AlertDialog open={open}>
			<AlertDialogTrigger asChild>
				<Button
					className="relative w-full"
					variant="secondary"
					onClick={() => setOpen(true)}
				>
					<HardDriveDownload className="h-4 w-4" />
					<span className="absolute -right-1 -top-2 flex h-3 w-3">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
						<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
					</span>
					{t("settings.webServer.updateWebServer.update")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{updating
							? t("settings.webServer.updateWebServer.updating")
							: t("settings.webServer.updateWebServer.title")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{updating ? (
							<span className="flex items-center gap-1">
								<Loader2 className="animate-spin" />
								{t("settings.webServer.updateWebServer.description")}
							</span>
						) : (
							<>{t("settings.webServer.updateWebServer.description")}</>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{!updating && (
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setOpen(false)}>
							{t("settings.webServer.updateWebServer.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirm}>
							{t("settings.webServer.updateWebServer.update")}
						</AlertDialogAction>
					</AlertDialogFooter>
				)}
			</AlertDialogContent>
		</AlertDialog>
	);
};
