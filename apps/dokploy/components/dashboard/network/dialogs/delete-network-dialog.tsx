import { useState } from "react";
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
import { api } from "@/utils/api";
import type { NetworkData } from "../show/show-networks";

interface DeleteNetworkDialogProps {
	children: React.ReactNode;
	network: NetworkData;
}

export function DeleteNetworkDialog({
	children,
	network,
}: DeleteNetworkDialogProps) {
	const [isOpen, setIsOpen] = useState(false);

	const utils = api.useUtils();

	const removeNetworkMutation = api.network.remove.useMutation({
		onSuccess: () => {
			toast.success(`Network ${network.name} deleted successfully`);
			utils.network.getAll.invalidate();
			setIsOpen(false);
		},
		onError: (error) => {
			toast.error(error.message || "Failed to delete network");
		},
	});

	const handleDelete = () => {
		removeNetworkMutation.mutate({
			networkId: network.id,
			serverId: network.serverId || undefined,
		});
	};

	const isLoading = removeNetworkMutation.isPending;

	return (
		<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
			<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete network</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete the network{" "}
						<span className="font-semibold">{network.name}</span>? This action
						cannot be undone and will disconnect all containers from this
						network.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleDelete}
						disabled={isLoading}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{isLoading ? "Deleting..." : "Delete network"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
