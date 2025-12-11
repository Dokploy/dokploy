import { useTranslation } from "next-i18next";
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
									toast.success(
										t("settings.server.webServer.storage.cleanedImages"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.server.webServer.storage.cleanedImagesError"),
									);
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
									toast.success(
										t("settings.server.webServer.storage.cleanedVolumes"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.server.webServer.storage.cleanedVolumesError"),
									);
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
									toast.success(
										t(
											"settings.server.webServer.storage.cleanedStoppedContainers",
										),
									);
								})
								.catch(() => {
									toast.error(
										t(
											"settings.server.webServer.storage.cleanedStoppedContainersError",
										),
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
									toast.success(
										t(
											"settings.server.webServer.storage.cleanedDockerBuilder",
										),
									);
								})
								.catch(() => {
									toast.error(
										t(
											"settings.server.webServer.storage.cleanedDockerBuilderError",
										),
									);
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
										toast.success(
											t("settings.server.webServer.storage.cleanedMonitoring"),
										);
									})
									.catch(() => {
										toast.error(
											t(
												"settings.server.webServer.storage.cleanedMonitoringError",
											),
										);
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
									toast.success(
										t("settings.server.webServer.storage.cleanedAll"),
									);
								})
								.catch(() => {
									toast.error(
										t("settings.server.webServer.storage.cleanedAllError"),
									);
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
