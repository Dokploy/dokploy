import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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

interface Props {
	serverId?: string;
}
export const ShowStorageActions = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const { mutateAsync: cleanAll, isPending: cleanAllIsLoading } =
		api.settings.cleanAll.useMutation();

	const {
		mutateAsync: cleanDockerBuilder,
		isPending: cleanDockerBuilderIsPending,
	} = api.settings.cleanDockerBuilder.useMutation();

	const { mutateAsync: cleanMonitoring } =
		api.settings.cleanMonitoring.useMutation();
	const {
		mutateAsync: cleanUnusedImages,
		isPending: cleanUnusedImagesIsPending,
	} = api.settings.cleanUnusedImages.useMutation();

	const {
		mutateAsync: cleanUnusedVolumes,
		isPending: cleanUnusedVolumesIsPending,
	} = api.settings.cleanUnusedVolumes.useMutation();

	const {
		mutateAsync: cleanStoppedContainers,
		isPending: cleanStoppedContainersIsPending,
	} = api.settings.cleanStoppedContainers.useMutation();

	const { mutateAsync: cleanPatchRepos, isPending: cleanPatchReposIsLoading } =
		api.patch.cleanPatchRepos.useMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				asChild
				disabled={
					cleanAllIsLoading ||
					cleanDockerBuilderIsPending ||
					cleanUnusedImagesIsPending ||
					cleanUnusedVolumesIsPending ||
					cleanStoppedContainersIsPending ||
					cleanPatchReposIsLoading
				}
			>
				<Button
					isLoading={
						cleanAllIsLoading ||
						cleanDockerBuilderIsPending ||
						cleanUnusedImagesIsPending ||
						cleanUnusedVolumesIsPending ||
						cleanStoppedContainersIsPending ||
						cleanPatchReposIsLoading
					}
					variant="outline"
				>
					{t("settings.servers.storageActions.space")}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-64" align="start">
				<DropdownMenuLabel>
					{t("settings.servers.storageActions.actions")}
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
									toast.success(
										t("settings.servers.storageActions.imagesCleaned"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.servers.storageActions.imagesCleanError"),
									);
								});
						}}
					>
						<span>
							{t("settings.servers.storageActions.cleanUnusedImages")}
						</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanUnusedVolumes({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(
										t("settings.servers.storageActions.volumesCleaned"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.servers.storageActions.volumesCleanError"),
									);
								});
						}}
					>
						<span>
							{t("settings.servers.storageActions.cleanUnusedVolumes")}
						</span>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanStoppedContainers({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(
										t("settings.servers.storageActions.containersCleaned"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.servers.storageActions.containersCleanError"),
									);
								});
						}}
					>
						<span>
							{t("settings.servers.storageActions.cleanStoppedContainers")}
						</span>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanPatchRepos({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(
										t("settings.servers.storageActions.patchCachesCleaned"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.servers.storageActions.patchCachesCleanError"),
									);
								});
						}}
					>
						<span>{t("settings.servers.storageActions.cleanPatchCaches")}</span>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanDockerBuilder({
								serverId: serverId,
							})
								.then(async () => {
									toast.success(
										t("settings.servers.storageActions.dockerBuilderCleaned"),
									);
								})
								.catch(() => {
									toast.error(
										t(
											"settings.servers.storageActions.dockerBuilderCleanError",
										),
									);
								});
						}}
					>
						<span>
							{t("settings.servers.storageActions.cleanDockerBuilder")}
						</span>
					</DropdownMenuItem>
					{!serverId && (
						<DropdownMenuItem
							className="w-full cursor-pointer"
							onClick={async () => {
								await cleanMonitoring()
									.then(async () => {
										toast.success(
											t("settings.servers.storageActions.monitoringCleaned"),
										);
									})
									.catch(() => {
										toast.error(
											t("settings.servers.storageActions.monitoringCleanError"),
										);
									});
							}}
						>
							<span>
								{t("settings.servers.storageActions.cleanMonitoring")}
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
									toast.success(
										t("settings.servers.storageActions.cleaningInProgress"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.servers.storageActions.cleanAllError"),
									);
								});
						}}
					>
						<span>{t("settings.servers.storageActions.cleanAll")}</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
