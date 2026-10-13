import { Check, ChevronsUpDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

type ServiceType =
	| "application"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql";

interface Props {
	id: string;
	type: ServiceType;
}

export const AssignNetworks = ({ id, type }: Props) => {
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const [detached, setDetached] = useState(false);

	const {
		service,
		serverId,
		networkIds,
		detachDokployNetwork,
		updateAsync,
		isUpdating,
		refetch,
	} = useServiceNetworks(id, type);

	const { data: networks } = api.network.all.useQuery(
		{ serverId: serverId ?? undefined },
		{ enabled: service !== undefined },
	);

	const { data: applicationDomains } = api.domain.byApplicationId.useQuery(
		{ applicationId: id },
		{ enabled: type === "application" },
	);
	const hasDomains = (applicationDomains?.length ?? 0) > 0;

	useEffect(() => {
		setSelected(networkIds ?? []);
		setDetached(detachDokployNetwork ?? false);
	}, [networkIds, detachDokployNetwork]);

	const availableNetworks = (networks ?? []).filter(
		(n) => n.driver === "overlay",
	);
	const selectedNetworks = availableNetworks.filter((n) =>
		selected.includes(n.networkId),
	);
	const isDirty =
		selected.length !== (networkIds?.length ?? 0) ||
		selected.some((networkId) => !networkIds?.includes(networkId)) ||
		detached !== detachDokployNetwork;

	const toggle = (networkId: string) => {
		setSelected((prev) =>
			prev.includes(networkId)
				? prev.filter((id) => id !== networkId)
				: [...prev, networkId],
		);
	};

	const onSave = async () => {
		try {
			await updateAsync({
				networkIds: selected,
				detachDokployNetwork: detached,
			});
			toast.success("Networks updated. Redeploy the service to apply them.");
			await refetch();
		} catch (error) {
			toast.error("Error updating networks", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-1">
					<CardTitle className="text-xl">Networks</CardTitle>
					<CardDescription>
						Attach additional Docker networks to this service so it can reach
						services on those networks. Takes effect on the next deploy.
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-row items-start justify-between gap-3 rounded-lg border p-4">
					<div className="space-y-1 pr-1">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">
								Detach from dokploy-network
							</span>
							<Badge variant="secondary">dokploy-network</Badge>
						</div>
						<p className="text-sm text-muted-foreground">
							By default the service joins the shared dokploy-network. Detach it
							to keep it reachable only through the networks you attach below.
						</p>
					</div>
					<Switch checked={detached} onCheckedChange={setDetached} />
				</div>

				{detached && hasDomains && (
					<AlertBlock type="warning">
						Warning: this service has domains. Detaching it from dokploy-network
						will break Traefik routing, and its domains will stop working.
					</AlertBlock>
				)}

				{detached && !hasDomains && selected.length === 0 && (
					<AlertBlock type="warning">
						This service is detached from dokploy-network but has no other
						network attached. It would be unreachable, so dokploy-network will
						be kept until you attach a network below.
					</AlertBlock>
				)}

				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							aria-expanded={open}
							className="w-full justify-between"
						>
							<span className="text-muted-foreground">
								{selectedNetworks.length > 0
									? `${selectedNetworks.length} network${
											selectedNetworks.length > 1 ? "s" : ""
										} selected`
									: "Select networks..."}
							</span>
							<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						className="w-[var(--radix-popover-trigger-width)] p-0"
						align="start"
					>
						<Command>
							<CommandInput placeholder="Search networks..." className="h-9" />
							<CommandList className="max-h-60">
								{availableNetworks.length === 0 ? (
									<div className="py-6 text-center text-sm text-muted-foreground">
										No overlay networks on this server.
									</div>
								) : (
									<>
										<CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
											No networks found.
										</CommandEmpty>
										<CommandGroup>
											{availableNetworks.map((n) => {
												const isSelected = selected.includes(n.networkId);
												return (
													<CommandItem
														key={n.networkId}
														value={n.name}
														onSelect={() => toggle(n.networkId)}
														className="cursor-pointer"
													>
														<Checkbox
															checked={isSelected}
															className="mr-2"
															onCheckedChange={() => toggle(n.networkId)}
														/>
														<span>{n.name}</span>
														<Badge variant="outline" className="ml-2">
															{n.driver}
														</Badge>
														<Check
															className={cn(
																"ml-auto size-4",
																isSelected ? "opacity-100" : "opacity-0",
															)}
														/>
													</CommandItem>
												);
											})}
										</CommandGroup>
									</>
								)}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>

				{selectedNetworks.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{selectedNetworks.map((n) => (
							<Badge
								key={n.networkId}
								variant="secondary"
								className="flex items-center gap-1 pr-1"
							>
								{n.name}
								<button
									type="button"
									onClick={() => toggle(n.networkId)}
									className="ml-0.5 rounded-full outline-hidden hover:opacity-70"
								>
									<X className="size-3" />
									<span className="sr-only">Remove {n.name}</span>
								</button>
							</Badge>
						))}
					</div>
				)}

				<div className="flex justify-end">
					<Button disabled={!isDirty} isLoading={isUpdating} onClick={onSave}>
						Save
					</Button>
				</div>
			</CardContent>
		</Card>
	);
};

// Maps a service type to its one-query and update-mutation, normalizing the
// per-type id field name and the networkIds field.
const useServiceNetworks = (id: string, type: ServiceType) => {
	const application = api.application.one.useQuery(
		{ applicationId: id },
		{ enabled: type === "application" },
	);
	const postgres = api.postgres.one.useQuery(
		{ postgresId: id },
		{ enabled: type === "postgres" },
	);
	const mysql = api.mysql.one.useQuery(
		{ mysqlId: id },
		{ enabled: type === "mysql" },
	);
	const mariadb = api.mariadb.one.useQuery(
		{ mariadbId: id },
		{ enabled: type === "mariadb" },
	);
	const mongo = api.mongo.one.useQuery(
		{ mongoId: id },
		{ enabled: type === "mongo" },
	);
	const redis = api.redis.one.useQuery(
		{ redisId: id },
		{ enabled: type === "redis" },
	);
	const libsql = api.libsql.one.useQuery(
		{ libsqlId: id },
		{ enabled: type === "libsql" },
	);
	const applicationUpdate = api.application.update.useMutation();
	const postgresUpdate = api.postgres.update.useMutation();
	const mysqlUpdate = api.mysql.update.useMutation();
	const mariadbUpdate = api.mariadb.update.useMutation();
	const mongoUpdate = api.mongo.update.useMutation();
	const redisUpdate = api.redis.update.useMutation();
	const libsqlUpdate = api.libsql.update.useMutation();

	const map = {
		application: {
			query: application,
			mutation: applicationUpdate,
			save: (payload: SavePayload) =>
				applicationUpdate.mutateAsync({ applicationId: id, ...payload }),
		},
		postgres: {
			query: postgres,
			mutation: postgresUpdate,
			save: (payload: SavePayload) =>
				postgresUpdate.mutateAsync({ postgresId: id, ...payload }),
		},
		mysql: {
			query: mysql,
			mutation: mysqlUpdate,
			save: (payload: SavePayload) =>
				mysqlUpdate.mutateAsync({ mysqlId: id, ...payload }),
		},
		mariadb: {
			query: mariadb,
			mutation: mariadbUpdate,
			save: (payload: SavePayload) =>
				mariadbUpdate.mutateAsync({ mariadbId: id, ...payload }),
		},
		mongo: {
			query: mongo,
			mutation: mongoUpdate,
			save: (payload: SavePayload) =>
				mongoUpdate.mutateAsync({ mongoId: id, ...payload }),
		},
		redis: {
			query: redis,
			mutation: redisUpdate,
			save: (payload: SavePayload) =>
				redisUpdate.mutateAsync({ redisId: id, ...payload }),
		},
		libsql: {
			query: libsql,
			mutation: libsqlUpdate,
			save: (payload: SavePayload) =>
				libsqlUpdate.mutateAsync({ libsqlId: id, ...payload }),
		},
	}[type];

	const service = map.query.data;

	return {
		service,
		serverId: service?.serverId ?? null,
		networkIds: service?.networkIds ?? [],
		detachDokployNetwork: service?.detachDokployNetwork ?? false,
		updateAsync: map.save,
		isUpdating: map.mutation.isPending,
		refetch: map.query.refetch,
	};
};

type SavePayload = {
	networkIds: string[];
	detachDokployNetwork: boolean;
};
