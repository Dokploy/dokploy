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
					Space
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-64" align="start">
				<DropdownMenuLabel>Actions</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanUnusedImages({
								serverId: serverId,
							})
								.then(async () => {
									toast.success("Cleaned images");
								})
								.catch(() => {
									toast.error("Error cleaning images");
								});
						}}
					>
						<span>Clean unused images</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanUnusedVolumes({
								serverId: serverId,
							})
								.then(async () => {
									toast.success("Cleaned volumes");
								})
								.catch(() => {
									toast.error("Error cleaning volumes");
								});
						}}
					>
						<span>Clean unused volumes</span>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanStoppedContainers({
								serverId: serverId,
							})
								.then(async () => {
									toast.success("Stopped containers cleaned");
								})
								.catch(() => {
									toast.error("Error cleaning stopped containers");
								});
						}}
					>
						<span>Clean stopped containers</span>
					</DropdownMenuItem>

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanDockerBuilder({
								serverId: serverId,
							})
								.then(async () => {
									toast.success("Cleaned Docker Builder");
								})
								.catch(() => {
									toast.error("Error cleaning Docker Builder");
								});
						}}
					>
						<span>Clean Docker Builder & System</span>
					</DropdownMenuItem>
					{!serverId && (
						<DropdownMenuItem
							className="w-full cursor-pointer"
							onClick={async () => {
								await cleanMonitoring()
									.then(async () => {
										toast.success("Cleaned Monitoring");
									})
									.catch(() => {
										toast.error("Error cleaning Monitoring");
									});
							}}
						>
							<span>Clean Monitoring</span>
						</DropdownMenuItem>
					)}

					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={async () => {
							await cleanAll({
								serverId: serverId,
							})
								.then(async () => {
									toast.success("Cleaning in progress... Please wait");
								})
								.catch(() => {
									toast.error("Error cleaning all");
								});
						}}
					>
						<span>Clean all</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
