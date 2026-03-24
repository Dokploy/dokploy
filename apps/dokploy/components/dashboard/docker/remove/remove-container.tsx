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
	const utils = api.useUtils();
	const { mutateAsync, isPending } = api.docker.removeContainer.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer text-red-500 hover:!text-red-600"
					onSelect={(e) => e.preventDefault()}
				>
					Remove Container
				</DropdownMenuItem>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This will permanently remove the container{" "}
						<span className="font-semibold">{containerId}</span>. If the
						container is running, it will be forcefully stopped and removed.
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={async () => {
							await mutateAsync({ containerId, serverId })
								.then(async () => {
									toast.success("Container removed successfully");
									await utils.docker.getContainers.invalidate();
								})
								.catch((err) => {
									toast.error(err.message);
								});
						}}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
