import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";

interface Props {
	networkId: string;
}

export const DeleteNetwork = ({ networkId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const { mutateAsync, isLoading, error, isError } =
		api.network.delete.useMutation();

	const handleDelete = async () => {
		try {
			await mutateAsync({ networkId });
			toast.success("Network deleted successfully");
			await utils.network.all.invalidate();
			setIsOpen(false);
		} catch (error) {
			console.error("Failed to delete network:", error);
		}
	};

	return (
		<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
			<AlertDialogTrigger asChild>
				<DropdownMenuItem
					className="text-destructive focus:text-destructive"
					onSelect={(e) => {
						e.preventDefault();
						setIsOpen(true);
					}}
				>
					<Trash2 className="mr-2 h-4 w-4" />
					Delete
				</DropdownMenuItem>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Network</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete this network? This action cannot be
						undone.
					</AlertDialogDescription>
				</AlertDialogHeader>

				{isError && (
					<AlertBlock type="error">
						{error?.message || "Failed to delete network"}
					</AlertBlock>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
					<Button
						variant="destructive"
						onClick={handleDelete}
						isLoading={isLoading}
					>
						Delete Network
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
