import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { ServerServicesList, useServerServices } from "./server-services-list";

interface Props {
	serverId: string;
	serverName: string;
	children: React.ReactNode;
}

export const DeleteServerModal = ({
	serverId,
	serverName,
	children,
}: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { services, isLoading, deletingId, deleteService } = useServerServices(
		serverId,
		open,
	);
	const { mutateAsync: deleteServer, isPending: isDeletingServer } =
		api.server.remove.useMutation();

	const canDelete = (services?.length ?? 0) === 0;

	const handleDeleteServer = async () => {
		try {
			const result = await deleteServer({ serverId });
			toast.success(`Server ${serverName} deleted successfully`);
			if (result?.vectorAgentRemovalWarning) {
				toast.error(
					`Couldn't reach this host to remove the Vector logs and metrics agent; if it was deployed it may still be running: ${result.vectorAgentRemovalWarning}`,
				);
			}
			setOpen(false);
			utils.server.all.invalidate();
		} catch (error: any) {
			toast.error(error.message);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent
				className="max-w-lg"
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Delete Server</DialogTitle>
					<DialogDescription>
						This will permanently delete "{serverName}" and all associated data.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : canDelete ? (
					<AlertBlock type="info">
						No services are associated with this server. You can delete it
						safely.
					</AlertBlock>
				) : (
					<div className="flex flex-col gap-3">
						<AlertBlock type="warning">
							This server has {services?.length} service
							{services?.length === 1 ? "" : "s"} associated. Delete them before
							removing the server.
						</AlertBlock>
						<ServerServicesList
							services={services ?? []}
							deletingId={deletingId}
							onDelete={deleteService}
						/>
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						disabled={!canDelete || isDeletingServer}
						onClick={handleDeleteServer}
					>
						Delete Server
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
