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
import { toast } from "sonner";

interface Props {
	isNavbar?: boolean;
}

export const UpdateWebServer = ({ isNavbar }: Props) => {
	const { mutateAsync: updateServer, isLoading } =
		api.settings.updateServer.useMutation();

	const buttonLabel = isNavbar ? "Update available" : "Update server";

	const handleConfirm = async () => {
		try {
			await updateServer();
			toast.success(
				"The server has been updated. The page will be reloaded to reflect the changes...",
			);
			setTimeout(() => {
				// Allow seeing the toast before reloading
				window.location.reload();
			}, 2000);
		} catch (error) {
			console.error("Error updating server:", error);
			toast.error(
				"An error occurred while updating the server, please try again.",
			);
		}
	};

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					className="relative w-full"
					variant={isNavbar ? "outline" : "secondary"}
					isLoading={isLoading}
				>
					{!isLoading && (
						<span className="absolute -right-1 -top-2 flex h-3 w-3">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
							<span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
						</span>
					)}
					{isLoading ? "Updating..." : buttonLabel}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will update the web server to the
						new version. The page will be reloaded once the update is finished.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
