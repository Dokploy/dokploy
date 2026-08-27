import { MoveRight } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
}

export const MoveApplicationToServer = ({ applicationId }: Props) => {
	const [open, setOpen] = useState(false);
	const [targetServerId, setTargetServerId] = useState("");
	const [pendingMigrationId, setPendingMigrationId] = useState<string>();
	const utils = api.useUtils();
	const { data: application } = api.application.one.useQuery({ applicationId });
	const { data: pendingMove } = api.application.pendingServerMove.useQuery(
		{ applicationId },
		{ enabled: open },
	);
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const showLocalOption = !isCloud && !webServerSettings?.remoteServersOnly;
	const unsupportedMounts = application?.mounts.filter(
		(mount) => mount.type === "bind" || mount.type === "volume",
	);

	const move = api.application.moveToServer.useMutation();
	const finalize = api.application.finalizeServerMove.useMutation();
	const rollback = api.application.rollbackServerMove.useMutation();
	const effectivePendingMigrationId =
		pendingMigrationId ?? pendingMove?.migrationId;
	const canFinalize =
		pendingMove?.status === "ready" ||
		pendingMove?.status === "finalizing" ||
		!!pendingMigrationId;

	const invalidateApplication = async () => {
		await Promise.all([
			utils.application.one.invalidate({ applicationId }),
			utils.application.pendingServerMove.invalidate({ applicationId }),
		]);
	};

	const handleMove = async () => {
		const normalizedTarget =
			targetServerId === "dokploy" ? null : targetServerId;
		const result = await move.mutateAsync({
			applicationId,
			targetServerId: normalizedTarget,
		});
		setPendingMigrationId(result.migrationId);
		await invalidateApplication();
		toast.success("Application deployed on the target server");
	};

	const handleFinalize = async () => {
		if (!effectivePendingMigrationId) return;
		await finalize.mutateAsync({
			applicationId,
			migrationId: effectivePendingMigrationId,
		});
		setPendingMigrationId(undefined);
		setTargetServerId("");
		setOpen(false);
		await invalidateApplication();
		toast.success("Source server cleanup completed");
	};

	const handleRollback = async () => {
		if (!effectivePendingMigrationId) return;
		await rollback.mutateAsync({
			applicationId,
			migrationId: effectivePendingMigrationId,
		});
		setPendingMigrationId(undefined);
		await invalidateApplication();
		toast.success("Migration was rolled back to the source server");
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen && !effectivePendingMigrationId) {
					setTargetServerId("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10"
					aria-label="Move application to another server"
				>
					<MoveRight className="size-3.5 text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Move application to another server</DialogTitle>
					<DialogDescription>
						Deploy the application on a new server, verify routing, then clean
						up the source server.
					</DialogDescription>
				</DialogHeader>

				{!effectivePendingMigrationId ? (
					<div className="grid gap-4">
						<AlertBlock type="warning">
							Custom network assignments are reset. Update DNS to the target
							server before removing the source deployment.
						</AlertBlock>
						{(unsupportedMounts?.length ?? 0) > 0 && (
							<AlertBlock type="error">
								Automatic moves are blocked for applications with bind mounts or
								named volumes. Back up and migrate their data first.
							</AlertBlock>
						)}
						<div className="grid gap-2">
							<Label>Target server</Label>
							<Select value={targetServerId} onValueChange={setTargetServerId}>
								<SelectTrigger>
									<SelectValue placeholder="Select target server" />
								</SelectTrigger>
								<SelectContent>
									{showLocalOption && application?.serverId && (
										<SelectItem value="dokploy">Dokploy Server</SelectItem>
									)}
									{servers
										?.filter(
											(server) => server.serverId !== application?.serverId,
										)
										.map((server) => (
											<SelectItem key={server.serverId} value={server.serverId}>
												{server.name} ({server.ipAddress})
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
					</div>
				) : (
					<AlertBlock type="warning">
						{canFinalize
							? "The target deployment succeeded. Confirm that DNS and health checks point to the target before cleaning up the source server."
							: "This migration was interrupted or could not be rolled back automatically. Retry rollback to restore the source assignment and remove owned target artifacts."}
					</AlertBlock>
				)}

				<DialogFooter>
					{!effectivePendingMigrationId ? (
						<Button
							onClick={handleMove}
							isLoading={move.isPending}
							disabled={
								!targetServerId ||
								(unsupportedMounts?.length ?? 0) > 0 ||
								move.isPending
							}
						>
							Deploy on target
						</Button>
					) : canFinalize ? (
						<Button
							variant="destructive"
							onClick={handleFinalize}
							isLoading={finalize.isPending}
						>
							Clean up source server
						</Button>
					) : (
						<Button
							variant="destructive"
							onClick={handleRollback}
							isLoading={rollback.isPending}
						>
							Retry rollback
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
