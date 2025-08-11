import { Button } from "@/components/ui/button";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";

interface Props {
	serverId?: string;
}
export const ShowStorageActions = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const { mutateAsync: cleanAll, isLoading: cleanAllIsLoading } =
		api.settings.cleanAll.useMutation();

	const {
		mutateAsync: cleanDockerBuilder,
		isLoading: cleanDockerBuilderIsLoading,
	} = api.settings.cleanDockerBuilder.useMutation();

	const { mutateAsync: cleanMonitoring } =
		api.settings.cleanMonitoring.useMutation();
	const {
		mutateAsync: cleanUnusedImages,
		isLoading: cleanUnusedImagesIsLoading,
	} = api.settings.cleanUnusedImages.useMutation();

	const {
		mutateAsync: cleanUnusedVolumes,
		isLoading: cleanUnusedVolumesIsLoading,
	} = api.settings.cleanUnusedVolumes.useMutation();

	const {
		mutateAsync: cleanStoppedContainers,
		isLoading: cleanStoppedContainersIsLoading,
	} = api.settings.cleanStoppedContainers.useMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				asChild
				disabled={
					cleanAllIsLoading ||
					cleanDockerBuilderIsLoading ||
					cleanUnusedImagesIsLoading ||
					cleanUnusedVolumesIsLoading ||
					cleanStoppedContainersIsLoading
				}
			>
				<Button
					isLoading={
						cleanAllIsLoading ||
						cleanDockerBuilderIsLoading ||
						cleanUnusedImagesIsLoading ||
						cleanUnusedVolumesIsLoading ||
						cleanStoppedContainersIsLoading
					}
					variant="outline"
				>
					{t("settings.server.webServer.storage.label")}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-64" align="start">
				<DropdownMenuLabel>
					{t("settings.server.webServer.actions")}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanUnusedImages({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(t("settings.storage.imagesCleaned"));
								})
								.catch(() => {
									toast.error(t("settings.storage.errorCleaningImages"));
								});
						}}
					>
						<span>
							{t("settings.server.webServer.storage.cleanUnusedImages")}
						</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanUnusedVolumes({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(t("settings.storage.volumesCleaned"));
								})
								.catch(() => {
									toast.error(t("settings.storage.errorCleaningVolumes"));
								});
						}}
					>
						<span>
							{t("settings.server.webServer.storage.cleanUnusedVolumes")}
						</span>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanStoppedContainers({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(t("settings.storage.stoppedContainersCleaned"));
								})
								.catch(() => {
									toast.error(
										t("settings.storage.errorCleaningStoppedContainers"),
									);
								});
						}}
					>
						<span>
							{t("settings.server.webServer.storage.cleanStoppedContainers")}
						</span>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanDockerBuilder({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(t("settings.storage.dockerBuilderCleaned"));
								})
								.catch(() => {
									toast.error(t("settings.storage.errorCleaningDockerBuilder"));
								});
						}}
					>
						<span>
							{t("settings.server.webServer.storage.cleanDockerBuilder")}
						</span>
					</DropdownMenuItem>
					{!serverId && (
						<DropdownMenuItem
							className="w-full cursor-pointer"
							onClick={async () => {
								await cleanMonitoring()
									.then(async () => {
										toast.success(t("settings.storage.monitoringCleaned"));
									})
									.catch(() => {
										toast.error(t("settings.storage.errorCleaningMonitoring"));
									});
							}}
						>
							<span>
								{t("settings.server.webServer.storage.cleanMonitoring")}
							</span>
						</DropdownMenuItem>
					)}

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanAll({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(t("settings.storage.allCleaned"));
								})
								.catch(() => {
									toast.error(t("settings.storage.errorCleaningAll"));
								});
						}}
					>
						<span>{t("settings.server.webServer.storage.cleanAll")}</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
