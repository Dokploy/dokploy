"use client";

import { AlertTriangle, Loader2, Network } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/utils/api";

// Compose omitted: attaches networks via compose YAML, not Swarm service spec.
export type NetworkAttachableResource =
	| "application"
	| "libsql"
	| "mariadb"
	| "mongo"
	| "mysql"
	| "postgres"
	| "redis";

interface Props {
	resourceType: NetworkAttachableResource;
	resourceId: string;
	/** Currently-attached network ids on the resource. */
	value: string[];
	/** Server the resource deploys to — filters the picker to matching networks. */
	serverId: string | null | undefined;
}

export const ResourceNetworksCard = ({
	resourceType,
	resourceId,
	value,
	serverId,
}: Props) => {
	const { data: networks, isLoading } = api.network.all.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const serverName = serverId
		? (servers?.find((s) => s.serverId === serverId)?.name ?? "this server")
		: "Dokploy host";

	// Payload shape differs per resource; server-side zod enforces correctness.
	const applicationUpdate = api.application.update.useMutation();
	const libsqlUpdate = api.libsql.update.useMutation();
	const mariadbUpdate = api.mariadb.update.useMutation();
	const mongoUpdate = api.mongo.update.useMutation();
	const mysqlUpdate = api.mysql.update.useMutation();
	const postgresUpdate = api.postgres.update.useMutation();
	const redisUpdate = api.redis.update.useMutation();

	const update = {
		application: applicationUpdate,
		libsql: libsqlUpdate,
		mariadb: mariadbUpdate,
		mongo: mongoUpdate,
		mysql: mysqlUpdate,
		postgres: postgresUpdate,
		redis: redisUpdate,
	}[resourceType];

	const utils = api.useUtils();

	// Only networks scoped to the same server as this resource. Mirrors backend resolver.
	// Apps + DBs run as Docker Swarm services (`docker service create`), and Swarm
	// rejects bridge networks at deploy time with HTTP 403. Hide non-overlay so users
	// don't pick something that will fail later.
	const availableNetworks = useMemo(() => {
		const target = serverId ?? null;
		return (networks ?? []).filter(
			(n) => (n.serverId ?? null) === target && n.driver === "overlay",
		);
	}, [networks, serverId]);

	// Saved IDs that don't apply: deleted networks or attached to a different server.
	const orphanIds = useMemo(() => {
		if (!networks) return [] as string[];
		const availableSet = new Set(availableNetworks.map((n) => n.networkId));
		return value.filter((id) => !availableSet.has(id));
	}, [networks, availableNetworks, value]);

	const persist = async (nextIds: string[]) => {
		const idKey = `${resourceType}Id` as const;
		const payload = { [idKey]: resourceId, networkIds: nextIds };
		await (update.mutateAsync as (p: unknown) => Promise<unknown>)(payload);
		const invalidate = (
			utils[resourceType] as unknown as {
				one: { invalidate: (args?: unknown) => Promise<void> };
			}
		).one.invalidate;
		await invalidate({ [idKey]: resourceId });
	};

	const toggle = async (networkId: string, checked: boolean) => {
		const nextIds = checked
			? [...value, networkId]
			: value.filter((id) => id !== networkId);
		try {
			await persist(nextIds);
			toast.success("Networks updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update networks",
			);
		}
	};

	const cleanOrphans = async () => {
		try {
			await persist(value.filter((id) => !orphanIds.includes(id)));
			toast.success(`Removed ${orphanIds.length} stale attachment(s)`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to clean attachments",
			);
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<Network className="size-5 text-muted-foreground" />
					Custom Networks
					<span className="text-sm font-normal text-muted-foreground">
						· on {serverName}
					</span>
				</CardTitle>
				<CardDescription>
					Attach this service to additional Docker networks on{" "}
					<span className="font-medium">{serverName}</span>. Only{" "}
					<code>overlay</code> networks scoped to this server are listed — Swarm
					services (which Apps and DBs deploy as) refuse <code>bridge</code>{" "}
					networks at deploy. The built-in <code>dokploy-network</code> stays
					attached for Traefik routing.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{orphanIds.length > 0 && (
					<div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
						<div className="flex items-start gap-2">
							<AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
							<div className="flex-1">
								<p className="font-medium text-amber-900 dark:text-amber-200">
									{orphanIds.length} attachment(s) won't apply
								</p>
								<p className="text-amber-800/90 dark:text-amber-200/80">
									These networks were deleted or belong to another server.
									Deploys silently skip them — clean them up to remove the stale
									references.
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={cleanOrphans}
								disabled={update.isPending}
							>
								Remove stale
							</Button>
						</div>
					</div>
				)}
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
						<Loader2 className="size-4 animate-spin" /> Loading networks…
					</div>
				) : availableNetworks.length === 0 ? (
					<div className="flex flex-col gap-3 py-2 text-sm text-muted-foreground">
						<p>
							No <span className="font-medium">overlay</span> networks defined
							for <span className="font-medium">{serverName}</span> yet. Apps
							and databases run as Swarm services and only accept overlay
							networks — create one on the Networks page with driver{" "}
							<code>overlay</code> and pick this server.
						</p>
						<Link href="/dashboard/networks">
							<Button variant="outline" size="sm">
								Manage networks
							</Button>
						</Link>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{availableNetworks.map((n) => {
							const checked = value.includes(n.networkId);
							return (
								<label
									key={n.networkId}
									className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
								>
									<Checkbox
										checked={checked}
										disabled={update.isPending}
										onCheckedChange={(v) => toggle(n.networkId, v === true)}
									/>
									<div className="flex flex-col flex-1 min-w-0">
										<span className="font-medium">{n.name}</span>
										<span className="text-xs text-muted-foreground">
											driver: {n.driver}
											{n.internal ? " · internal" : ""}
											{n.attachable ? " · attachable" : ""}
										</span>
									</div>
								</label>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
};
