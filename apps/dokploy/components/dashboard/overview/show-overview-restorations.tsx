import type { Restoration } from "@dokploy/server/db/schema";
import {
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
	RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
	RestorationLogs,
	restorationKindLabel,
	restorationStatusVariant,
} from "./restoration-logs";

export function RestorationHistoryTable({
	rows,
	isLoading,
	isError,
	onRetry,
	onOpenLogs,
}: {
	rows: Restoration[];
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
	onOpenLogs: (id: string) => void;
}) {
	if (isLoading)
		return (
			<div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				Loading restorations...
			</div>
		);
	if (isError)
		return (
			<div className="flex flex-col items-center gap-3 py-16">
				<p>Failed to load restorations.</p>
				<Button variant="outline" onClick={onRetry}>
					Retry
				</Button>
			</div>
		);
	if (!rows.length)
		return (
			<div className="py-16 text-center text-muted-foreground">
				No restorations match the current filters.
			</div>
		);
	return (
		<Table className="[&_th]:px-3 [&_td]:p-3">
			<TableHeader>
				<TableRow>
					<TableHead className="hidden md:table-cell">Date</TableHead>
					<TableHead>Service</TableHead>
					<TableHead className="hidden 2xl:table-cell">Target</TableHead>
					<TableHead className="hidden 2xl:table-cell">Backup file</TableHead>
					<TableHead className="hidden md:table-cell">Kind</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="sticky right-0 bg-background text-right">
						Logs
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.restorationId}>
						<TableCell className="hidden md:table-cell whitespace-nowrap text-sm">
							<div>{new Date(row.createdAt).toLocaleDateString()}</div>
							<span className="text-xs text-muted-foreground">
								{new Date(row.createdAt).toLocaleTimeString()}
							</span>
						</TableCell>
						<TableCell className="max-w-[140px] whitespace-normal md:min-w-[180px] md:max-w-[240px]">
							<div className="flex flex-col gap-1 min-w-0">
								{row.serviceHref ? (
									<Link
										href={row.serviceHref}
										className="font-medium hover:underline md:truncate"
									>
										{row.serviceName}
									</Link>
								) : (
									<span className="font-medium md:truncate">
										{row.serviceName}
									</span>
								)}
								<span className="text-xs text-muted-foreground md:truncate">
									{row.destinationName}
								</span>
							</div>
						</TableCell>
						<TableCell className="hidden 2xl:table-cell">
							<span
								className="block max-w-[160px] truncate"
								title={row.targetName}
							>
								{row.targetName}
							</span>
						</TableCell>
						<TableCell className="hidden 2xl:table-cell">
							<span
								className="block max-w-[180px] truncate text-muted-foreground"
								title={row.backupFile}
							>
								{row.backupFile.split("/").at(-1)}
							</span>
						</TableCell>
						<TableCell className="hidden md:table-cell">
							<Badge variant="outline">{restorationKindLabel[row.kind]}</Badge>
						</TableCell>
						<TableCell>
							<Badge variant={restorationStatusVariant[row.status]}>
								{row.status}
							</Badge>
						</TableCell>
						<TableCell className="sticky right-0 bg-background text-right">
							<Button
								variant="outline"
								size="sm"
								onClick={() => onOpenLogs(row.restorationId)}
								aria-label={`View logs for ${row.serviceName}`}
							>
								<FileText className="hidden sm:block size-4 mr-2" />
								<span className="hidden sm:inline">View logs</span>
								<span className="sm:hidden">Logs</span>
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export function ShowOverviewRestorations() {
	const router = useRouter();
	const serviceId =
		typeof router.query.service === "string" ? router.query.service : undefined;
	const [page, setPage] = useState(0);
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState<"all" | Restoration["status"]>("all");
	const [kind, setKind] = useState<"all" | Restoration["kind"]>("all");
	const [selected, setSelected] = useState<string | null>(null);
	const { data, isLoading, isError, isFetching, refetch } =
		api.restoration.list.useQuery(
			{ serviceId, offset: page * 25, limit: 25, search, status, kind },
			{ refetchInterval: 5000 },
		);
	return (
		<Card className="bg-sidebar p-2.5 rounded-xl w-full">
			<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h3 className="text-lg font-medium">
							Restorations
							{data && (
								<span className="text-sm font-normal text-muted-foreground">
									{" "}
									({data.total})
								</span>
							)}
						</h3>
						<p className="text-sm text-muted-foreground">
							Follow running restores and reopen previous logs.
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							void refetch();
						}}
						disabled={isFetching}
					>
						<RefreshCw
							className={`size-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
				</div>
				<div className="flex flex-wrap items-center gap-2 pt-2">
					<div className="w-full sm:w-80">
						<Input
							placeholder="Search service, target or backup file..."
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(0);
							}}
						/>
					</div>
					<Select
						value={status}
						onValueChange={(value) => {
							setStatus(value as "all" | Restoration["status"]);
							setPage(0);
						}}
					>
						<SelectTrigger className="w-[140px]" aria-label="Status">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All statuses</SelectItem>
							<SelectItem value="running">Running</SelectItem>
							<SelectItem value="done">Done</SelectItem>
							<SelectItem value="error">Error</SelectItem>
						</SelectContent>
					</Select>
					<Select
						value={kind}
						onValueChange={(value) => {
							setKind(value as "all" | Restoration["kind"]);
							setPage(0);
						}}
					>
						<SelectTrigger className="w-[140px]" aria-label="Kind">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All kinds</SelectItem>
							<SelectItem value="database">Database</SelectItem>
							<SelectItem value="volume">Volume</SelectItem>
							<SelectItem value="dokploy">Dokploy</SelectItem>
						</SelectContent>
					</Select>
					{serviceId && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								const { service: _service, ...query } = router.query;
								void router.replace(
									{ pathname: router.pathname, query },
									undefined,
									{ shallow: true },
								);
								setPage(0);
							}}
						>
							All services
						</Button>
					)}
				</div>
				<RestorationHistoryTable
					rows={data?.rows ?? []}
					isLoading={isLoading}
					isError={isError}
					onRetry={() => {
						void refetch();
					}}
					onOpenLogs={setSelected}
				/>
				<div className="flex items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
					<span>{data?.total ?? 0} restorations</span>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							aria-label="Previous page"
							disabled={page === 0}
							onClick={() => setPage((value) => value - 1)}
						>
							<ChevronLeft className="size-4" />
						</Button>
						<span>Page {page + 1}</span>
						<Button
							variant="outline"
							size="sm"
							aria-label="Next page"
							disabled={!data || (page + 1) * 25 >= data.total}
							onClick={() => setPage((value) => value + 1)}
						>
							<ChevronRight className="size-4" />
						</Button>
					</div>
				</div>
			</div>
			{selected && (
				<RestorationLogs
					restorationId={selected}
					open={!!selected}
					onOpenChange={(open) => {
						if (!open) setSelected(null);
					}}
				/>
			)}
		</Card>
	);
}
