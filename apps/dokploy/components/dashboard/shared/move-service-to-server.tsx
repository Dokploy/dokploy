import type { ServiceType } from "@dokploy/server/db/schema";
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

export type MoveableServiceType = Exclude<ServiceType, "application">;

interface Props {
	serviceType: MoveableServiceType;
	serviceId: string;
}

const serviceLabels: Record<MoveableServiceType, string> = {
	postgres: "Postgres",
	mysql: "MySQL",
	mariadb: "MariaDB",
	mongo: "MongoDB",
	redis: "Redis",
	libsql: "LibSQL",
	compose: "Compose",
};

const getErrorMessage = (error: unknown, fallback: string) =>
	error instanceof Error ? error.message : fallback;

/**
 * Cross-server move dialog shared by Compose and every database service
 * type. Mirrors the application "move to server" UX (deploy on target,
 * then explicitly clean up the source once validated), but performs a full
 * data migration instead of an empty redeploy: the source is stopped for a
 * maintenance window, its volume(s) are streamed to the target, and only
 * then is the service pointed at the target server.
 */
export const MoveServiceToServer = ({ serviceType, serviceId }: Props) => {
	const [open, setOpen] = useState(false);
	const [targetServerId, setTargetServerId] = useState("");
	const utils = api.useUtils();

	const oneQueryMap = {
		postgres: () =>
			api.postgres.one.useQuery(
				{ postgresId: serviceId },
				{ enabled: !!serviceId },
			),
		mysql: () =>
			api.mysql.one.useQuery({ mysqlId: serviceId }, { enabled: !!serviceId }),
		mariadb: () =>
			api.mariadb.one.useQuery(
				{ mariadbId: serviceId },
				{ enabled: !!serviceId },
			),
		mongo: () =>
			api.mongo.one.useQuery({ mongoId: serviceId }, { enabled: !!serviceId }),
		redis: () =>
			api.redis.one.useQuery({ redisId: serviceId }, { enabled: !!serviceId }),
		libsql: () =>
			api.libsql.one.useQuery(
				{ libsqlId: serviceId },
				{ enabled: !!serviceId },
			),
		compose: () =>
			api.compose.one.useQuery(
				{ composeId: serviceId },
				{ enabled: !!serviceId },
			),
	} as const;

	const pendingMoveQueryMap = {
		postgres: () =>
			api.postgres.pendingServerMove.useQuery(
				{ postgresId: serviceId },
				{ enabled: open },
			),
		mysql: () =>
			api.mysql.pendingServerMove.useQuery(
				{ mysqlId: serviceId },
				{ enabled: open },
			),
		mariadb: () =>
			api.mariadb.pendingServerMove.useQuery(
				{ mariadbId: serviceId },
				{ enabled: open },
			),
		mongo: () =>
			api.mongo.pendingServerMove.useQuery(
				{ mongoId: serviceId },
				{ enabled: open },
			),
		redis: () =>
			api.redis.pendingServerMove.useQuery(
				{ redisId: serviceId },
				{ enabled: open },
			),
		libsql: () =>
			api.libsql.pendingServerMove.useQuery(
				{ libsqlId: serviceId },
				{ enabled: open },
			),
		compose: () =>
			api.compose.pendingServerMove.useQuery(
				{ composeId: serviceId },
				{ enabled: open },
			),
	} as const;

	const moveMutationMap = {
		postgres: () => api.postgres.moveToServer.useMutation(),
		mysql: () => api.mysql.moveToServer.useMutation(),
		mariadb: () => api.mariadb.moveToServer.useMutation(),
		mongo: () => api.mongo.moveToServer.useMutation(),
		redis: () => api.redis.moveToServer.useMutation(),
		libsql: () => api.libsql.moveToServer.useMutation(),
		compose: () => api.compose.moveToServer.useMutation(),
	} as const;

	const finalizeMutationMap = {
		postgres: () => api.postgres.finalizeServerMove.useMutation(),
		mysql: () => api.mysql.finalizeServerMove.useMutation(),
		mariadb: () => api.mariadb.finalizeServerMove.useMutation(),
		mongo: () => api.mongo.finalizeServerMove.useMutation(),
		redis: () => api.redis.finalizeServerMove.useMutation(),
		libsql: () => api.libsql.finalizeServerMove.useMutation(),
		compose: () => api.compose.finalizeServerMove.useMutation(),
	} as const;
	const rollbackMutationMap = {
		postgres: () => api.postgres.rollbackServerMove.useMutation(),
		mysql: () => api.mysql.rollbackServerMove.useMutation(),
		mariadb: () => api.mariadb.rollbackServerMove.useMutation(),
		mongo: () => api.mongo.rollbackServerMove.useMutation(),
		redis: () => api.redis.rollbackServerMove.useMutation(),
		libsql: () => api.libsql.rollbackServerMove.useMutation(),
		compose: () => api.compose.rollbackServerMove.useMutation(),
	} as const;

	const { data: service } = oneQueryMap[serviceType]();
	const { data: pendingMove } = pendingMoveQueryMap[serviceType]();
	const move = moveMutationMap[serviceType]();
	const finalize = finalizeMutationMap[serviceType]();
	const rollback = rollbackMutationMap[serviceType]();

	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const showLocalOption = !isCloud && !webServerSettings?.remoteServersOnly;

	const currentServerId = (service as { serverId?: string | null } | undefined)
		?.serverId;
	const cleanupId = (pendingMove as { migrationId?: string } | null)
		?.migrationId;
	const pendingStatus = (pendingMove as { status?: string } | null)?.status;
	const canFinalize =
		pendingStatus === "ready" || pendingStatus === "finalizing";

	const invalidateService = async () => {
		await Promise.all([
			utils[serviceType].one.invalidate(),
			utils[serviceType].pendingServerMove.invalidate(),
		]);
	};

	const buildIdPayload = (): Record<string, string> => {
		switch (serviceType) {
			case "postgres":
				return { postgresId: serviceId };
			case "mysql":
				return { mysqlId: serviceId };
			case "mariadb":
				return { mariadbId: serviceId };
			case "mongo":
				return { mongoId: serviceId };
			case "redis":
				return { redisId: serviceId };
			case "libsql":
				return { libsqlId: serviceId };
			case "compose":
				return { composeId: serviceId };
		}
	};

	const handleMove = async () => {
		const normalizedTarget =
			targetServerId === "dokploy" ? null : targetServerId;
		try {
			await move.mutateAsync({
				...buildIdPayload(),
				targetServerId: normalizedTarget,
			} as never);
			await invalidateService();
			toast.success(
				`${serviceLabels[serviceType]} data was migrated and deployed on the target server`,
			);
		} catch (error) {
			toast.error(
				getErrorMessage(
					error,
					`Failed to move the ${serviceLabels[serviceType]} service`,
				),
			);
		}
	};

	const handleFinalize = async () => {
		if (!cleanupId) return;
		try {
			await finalize.mutateAsync({
				...buildIdPayload(),
				migrationId: cleanupId,
			} as never);
			await invalidateService();
			setTargetServerId("");
			setOpen(false);
			toast.success("Source server cleanup completed");
		} catch (error) {
			toast.error(
				getErrorMessage(error, "Failed to clean up the source server"),
			);
		}
	};

	const handleRollback = async () => {
		if (!cleanupId) return;
		try {
			await rollback.mutateAsync({
				...buildIdPayload(),
				migrationId: cleanupId,
			} as never);
			await invalidateService();
			toast.success("Migration was rolled back to the source server");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to roll back the migration"));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen && !cleanupId) {
					setTargetServerId("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10"
					aria-label={`Move ${serviceLabels[serviceType]} to another server`}
				>
					<MoveRight className="size-3.5 text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						Move {serviceLabels[serviceType]} to another server
					</DialogTitle>
					<DialogDescription>
						Stops the service, copies all of its data to the target server, then
						deploys it there. The source stays intact (stopped) until you
						confirm the target is healthy and clean it up.
					</DialogDescription>
				</DialogHeader>

				{!cleanupId ? (
					<div className="grid gap-4">
						<AlertBlock type="warning">
							This will cause downtime: the service is stopped for the duration
							of the data transfer, which can take a while for large volumes.
							Custom network assignments are reset on the target.
						</AlertBlock>
						<div className="grid gap-2">
							<Label>Target server</Label>
							<Select value={targetServerId} onValueChange={setTargetServerId}>
								<SelectTrigger>
									<SelectValue placeholder="Select target server" />
								</SelectTrigger>
								<SelectContent>
									{showLocalOption && currentServerId && (
										<SelectItem value="dokploy">Dokploy Server</SelectItem>
									)}
									{servers
										?.filter((server) => server.serverId !== currentServerId)
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
							? "The target deployment succeeded and the data was migrated. Confirm the target is healthy before cleaning up the source server - its service and data are still there until you do."
							: "This migration was interrupted or could not be rolled back automatically. Retry rollback to remove owned target artifacts and restore the source."}
					</AlertBlock>
				)}

				<DialogFooter>
					{!cleanupId ? (
						<Button
							onClick={handleMove}
							isLoading={move.isPending}
							disabled={!targetServerId || move.isPending}
						>
							Migrate & deploy on target
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
