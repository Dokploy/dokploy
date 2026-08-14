import type { OverviewBackup } from "@dokploy/server/services/overview-shared";
import { getBackupOverviewIcon } from "@dokploy/server/services/overview-shared";
import {
	ArrowUpDown,
	CircuitBoard,
	GlobeIcon,
	Loader2,
	RefreshCw,
	ServerIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DB_ENGINE_ICONS } from "@/components/icons/data-tools-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary"> =
	{
		done: "default",
		running: "secondary",
		error: "destructive",
		cancelled: "destructive",
	};

const renderRowIcon = (row: OverviewBackup) => {
	const icon = getBackupOverviewIcon(row);
	if (icon.kind === "db") {
		const Icon = DB_ENGINE_ICONS[icon.engine as keyof typeof DB_ENGINE_ICONS];
		return Icon ? <Icon className="h-5 w-5" /> : null;
	}
	if (icon.kind === "webServer") {
		return <ServerIcon className="h-5 w-5 text-muted-foreground" />;
	}
	return icon.type === "compose" ? (
		<CircuitBoard className="h-5 w-5" />
	) : (
		<GlobeIcon className="h-5 w-5" />
	);
};

const detailHref = (row: OverviewBackup) => {
	if (!row.projectId || !row.environmentId || !row.serviceOwnerId) return null;
	return `/dashboard/project/${row.projectId}/environment/${row.environmentId}/services/${row.serviceOwnerType}/${row.serviceOwnerId}`;
};

export const ShowOverviewBackups = () => {
	const {
		data: backups,
		isFetching,
		isFetched,
		isError,
		refetch,
	} = api.overview.backups.useQuery(undefined, {
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});

	const [destinationId, setDestinationId] = useState("all");
	const [serviceOwnerId, setServiceOwnerId] = useState("all");
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

	const destinations = useMemo(() => {
		if (!backups) return [];
		const map = new Map<string, string>();
		for (const row of backups) map.set(row.destinationId, row.destinationName);
		return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
	}, [backups]);

	const services = useMemo(() => {
		if (!backups) return [];
		const map = new Map<string, string>();
		for (const row of backups) {
			if (row.serviceOwnerId) map.set(row.serviceOwnerId, row.serviceName);
		}
		return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
	}, [backups]);

	const rows = useMemo(() => {
		if (!backups) return [];
		const filtered = backups.filter(
			(row) =>
				(destinationId === "all" || row.destinationId === destinationId) &&
				(serviceOwnerId === "all" || row.serviceOwnerId === serviceOwnerId),
		);
		const sorted = [...filtered].sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
		return sortDirection === "asc" ? sorted : sorted.reverse();
	}, [backups, destinationId, serviceOwnerId, sortDirection]);

	return (
		<Card className="bg-sidebar p-2.5 rounded-xl w-full">
			<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3 justify-between">
					<h3 className="text-lg font-medium">
						Backups{" "}
						{isFetched && (
							<span className="text-sm font-normal text-muted-foreground">
								({rows.length})
							</span>
						)}
					</h3>
					<div className="flex flex-wrap items-center gap-2">
						{isFetched && (
							<>
								<Select value={destinationId} onValueChange={setDestinationId}>
									<SelectTrigger className="w-[180px]">
										<SelectValue placeholder="Destination" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All destinations</SelectItem>
										{destinations.map((d) => (
											<SelectItem key={d.id} value={d.id}>
												{d.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Select
									value={serviceOwnerId}
									onValueChange={setServiceOwnerId}
								>
									<SelectTrigger className="w-[180px]">
										<SelectValue placeholder="Service" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All services</SelectItem>
										{services.map((s) => (
											<SelectItem key={s.id} value={s.id}>
												{s.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setSortDirection((d) => (d === "desc" ? "asc" : "desc"))
									}
								>
									<ArrowUpDown className="size-4 mr-2" />
									{sortDirection === "desc" ? "Newest first" : "Oldest first"}
								</Button>
							</>
						)}
						<Button onClick={() => refetch()} disabled={isFetching} size="sm">
							{isFetching ? (
								<Loader2 className="size-4 animate-spin mr-2" />
							) : (
								<RefreshCw className="size-4 mr-2" />
							)}
							Refresh
						</Button>
					</div>
				</div>

				{isFetching && !isFetched && (
					<div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Loading backups...
					</div>
				)}

				{isFetched && isError && (
					<div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
						<span>Failed to load backups.</span>
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							Retry
						</Button>
					</div>
				)}

				{isFetched && !isError && rows.length === 0 && (
					<div className="flex items-center justify-center py-16 text-muted-foreground">
						No backups match the current filters.
					</div>
				)}

				{isFetched && !isError && rows.length > 0 && (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Service</TableHead>
								<TableHead>Destination</TableHead>
								<TableHead>Kind</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const href = detailHref(row);
								const name = href ? (
									<Link href={href} className="hover:underline">
										{row.serviceName}
									</Link>
								) : (
									row.serviceName
								);
								return (
									<TableRow key={row.deploymentId}>
										<TableCell className="whitespace-nowrap text-sm">
											{new Date(row.createdAt).toLocaleString()}
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												{renderRowIcon(row)}
												{name}
											</div>
										</TableCell>
										<TableCell>{row.destinationName}</TableCell>
										<TableCell>
											<Badge variant="outline">
												{row.kind === "backup" ? "Database" : "Volume"}
											</Badge>
										</TableCell>
										<TableCell>
											{row.status && (
												<Badge
													variant={STATUS_VARIANT[row.status] ?? "secondary"}
												>
													{row.status}
												</Badge>
											)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</div>
		</Card>
	);
};
