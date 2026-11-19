import { useTranslation } from "react-i18next";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";

interface Props {
	containerId: string;
	serverId?: string;
}

export const RemoveContainerDialog = ({ containerId, serverId }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const { mutateAsync, isPending } = api.docker.removeContainer.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer text-red-500 hover:text-red-600!"
					onSelect={(e) => e.preventDefault()}
				>
					{t("docker.remove.container")}
				</DropdownMenuItem>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("docker.remove.areYouSure")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("docker.remove.description", { containerId })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("docker.common.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={async () => {
							await mutateAsync({ containerId, serverId })
								.then(async () => {
									toast.success(t("docker.remove.success"));
									await utils.docker.getContainers.invalidate();
								})
								.catch((err) => {
									toast.error(err.message);
								});
						}}
					>
						{t("docker.common.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
