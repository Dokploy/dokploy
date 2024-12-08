import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { RefreshCcw } from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { UpdateWebServer } from "./update-webserver";
export const UpdateServer = () => {
	const [isUpdateAvailable, setIsUpdateAvailable] = useState<null | boolean>(
		null,
	);
	const { mutateAsync: checkAndUpdateImage, isLoading } =
		api.settings.checkAndUpdateImage.useMutation();
	const [isOpen, setIsOpen] = useState(false);

	const { t } = useTranslation("settings");
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary">
					<RefreshCcw className="h-4 w-4" />
					{t("settings.server.webServer.updates")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:m:max-w-lg ">
				<DialogHeader>
					<DialogTitle>
						{t("settings.server.webServer.updates.title")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.server.webServer.updates.description")}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<span className="text-sm text-muted-foreground">
						{t("settings.server.webServer.updates.suggestion")}
					</span>
					<ul className="list-disc list-inside text-sm text-muted-foreground">
						<li>
							{t(
								"settings.server.webServer.updates.suggestion.tryLatestFeatures",
							)}
						</li>
						<li>{t("settings.server.webServer.updates.suggestion.someBug")}</li>
					</ul>
					<AlertBlock type="info">
						{t(
							"settings.server.webServer.updates.suggestion.recommendCheckLatestVersion",
						)}{" "}
						<Link
							href="https://github.com/Dokploy/dokploy/releases"
							target="_blank"
							className="text-foreground"
						>
							{t("settings.server.webServer.updates.releases")}
						</Link>{" "}
						{t(
							"settings.server.webServer.updates.suggestion.checkLatestVersion",
						)}
					</AlertBlock>

					<div className="w-full flex flex-col gap-4">
						{isUpdateAvailable === false && (
							<div className="flex flex-col items-center gap-3">
								<RefreshCcw className="size-6 self-center text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									{t("settings.server.webServer.updates.latestVersion")}
								</span>
							</div>
						)}
						{isUpdateAvailable ? (
							<UpdateWebServer />
						) : (
							<Button
								className="w-full"
								onClick={async () => {
									await checkAndUpdateImage()
										.then(async (e) => {
											setIsUpdateAvailable(e);
										})
										.catch(() => {
											setIsUpdateAvailable(false);
											toast.error(
												t(
													"settings.server.webServer.updates.dockerCleanupError",
												),
											);
										});
									toast.success(
										t("settings.server.webServer.updates.dockerCleanupUpdated"),
									);
								}}
								isLoading={isLoading}
							>
								{t("settings.server.webServer.updates.button.checkUpdates")}
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
