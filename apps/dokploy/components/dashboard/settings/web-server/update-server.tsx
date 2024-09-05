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
import i18n from "@/i18n";
import { api } from "@/utils/api";
import { RefreshCcw } from "lucide-react";
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

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary">
					<RefreshCcw className="h-4 w-4" />
					{i18n.getText("PAGE.webServerSettings.updates")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:m:max-w-lg ">
				<DialogHeader>
					<DialogTitle>
						{i18n.getText("PAGE.webServerSettings.webServerUpdate")}
					</DialogTitle>
					<DialogDescription>
						{i18n.getText("PAGE.webServerSettings.checkNewReleases")}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<span className="text-sm text-muted-foreground">
						{i18n.getText("PAGE.webServerSettings.suggestToUpdate")}
					</span>
					<ul className="list-disc list-inside text-sm text-muted-foreground">
						<li>
							{i18n.getText("PAGE.webServerSettings.wantToTryLatestFeatures")}
						</li>
						<li>
							{i18n.getText("PAGE.webServerSettings.bugBlockingFeatures")}
						</li>
					</ul>
					<AlertBlock type="info">
						{i18n.getText("PAGE.webServerSettings.recommendSeeLatestVersion")}{" "}
						<Link
							href="https://github.com/Dokploy/dokploy/releases"
							target="_blank"
							className="text-foreground"
						>
							{i18n.getText("PAGE.webServerSettings.updates")}
						</Link>{" "}
						{i18n.getText("PAGE.webServerSettings.checkLatestVersion")}
					</AlertBlock>

					<div className="w-full flex flex-col gap-4">
						{isUpdateAvailable === false && (
							<div className="flex flex-col items-center gap-3">
								<RefreshCcw className="size-6 self-center text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									{i18n.getText("PAGE.webServerSettings.usingLatestVersion")}
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
												i18n.getText(
													"PAGE.webServerSettings.errorToCheckUpdates",
												),
											);
										});
									toast.success(
										i18n.getText("PAGE.webServerSettings.successCheckUpdates"),
									);
								}}
								isLoading={isLoading}
							>
								{i18n.getText("PAGE.webServerSettings.checkUpdates")}
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
