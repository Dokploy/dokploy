import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { Activity, ArrowUpDown, Loader2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { api, type RouterOutputs } from "@/utils/api";

interface Props {
	serverId?: string;
}

type DockerEvent = RouterOutputs["docker"]["getEvents"]["events"][number];
type EventRow = DockerEvent & { key: string };

const RANGE_OPTIONS = [
	{ labelKey: "docker.time.last5Minutes", value: 5 },
	{ labelKey: "docker.time.last15Minutes", value: 15 },
	{ labelKey: "docker.time.lastHour", value: 60 },
	{ labelKey: "docker.time.last6Hours", value: 360 },
	{ labelKey: "docker.time.last24Hours", value: 1440 },
];

type BadgeVariant = "blue" | "green" | "yellow" | "orange" | "red" | "blank";

const TYPE_VARIANTS: Record<string, BadgeVariant> = {
	container: "blue",
	image: "green",
	volume: "yellow",
	network: "orange",
	service: "blue",
	node: "orange",
};

const ACTION_VARIANTS: Record<string, BadgeVariant> = {
	create: "green",
	start: "green",
	pull: "green",
	connect: "green",
	die: "red",
	destroy: "red",
	kill: "red",
	stop: "red",
	remove: "red",
	disconnect: "red",
	pause: "yellow",
	unpause: "yellow",
};

const getTypeVariant = (type?: string): BadgeVariant =>
	(type && TYPE_VARIANTS[type]) || "blank";

const getActionVariant = (action?: string): BadgeVariant =>
	(action && ACTION_VARIANTS[action]) || "blank";

const getResource = (event: DockerEvent) =>
	event.Actor?.Attributes?.name ?? event.Actor?.ID ?? "-";

const getAttributesText = (event: DockerEvent) => {
	const attributes = Object.entries(event.Actor?.Attributes ?? {}).filter(
		([key]) => key !== "name",
	);
	return attributes.map(([key, value]) => `${key}=${value}`).join(" ") || "-";
};

const SortableHeader = ({
	column,
	title,
}: {
	column: {
		getIsSorted: () => false | "asc" | "desc";
		toggleSorting: (asc: boolean) => void;
	};
	title: string;
}) => (
	<Button
		variant="ghost"
		className="-ml-3 h-8"
		onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
	>
		{title}
		<ArrowUpDown className="ml-2 size-4" />
	</Button>
);

export const ShowDockerEvents = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const [minutes, setMinutes] = useState(15);
	const [search, setSearch] = useState("");
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "time", desc: true },
	]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 15,
	});

	const { data, isLoading, isRefetching, refetch, error } =
		api.docker.getEvents.useQuery({
			serverId,
			minutes,
		});

	const events = useMemo<EventRow[]>(
		() =>
			(data?.events ?? []).map((event, index) => ({
				...event,
				key: `${event.time}-${event.Action}-${index}`,
			})),
		[data],
	);

	const filteredEvents = useMemo(() => {
		if (!search.trim()) return events;
		const query = search.toLowerCase();
		return events.filter((event) => {
			return (
				event.Type?.toLowerCase().includes(query) ||
				event.Action?.toLowerCase().includes(query) ||
				event.Actor?.Attributes?.name?.toLowerCase().includes(query) ||
				event.Actor?.ID?.toLowerCase().includes(query)
			);
		});
	}, [events, search]);

	const columns = useMemo<ColumnDef<EventRow>[]>(
		() => [
			{
				id: "time",
				accessorFn: (event) => event.time ?? 0,
				header: ({ column }) => (
					<SortableHeader column={column} title={t("docker.events.time")} />
				),
				cell: ({ row }) => (
					<span className="text-xs text-muted-foreground whitespace-nowrap">
						{row.original.time
							? new Date(row.original.time * 1000).toLocaleTimeString()
							: "-"}
					</span>
				),
			},
			{
				id: "type",
				accessorFn: (event) => event.Type ?? "",
				header: ({ column }) => (
					<SortableHeader column={column} title={t("docker.events.type")} />
				),
				cell: ({ row }) => (
					<Badge variant={getTypeVariant(row.original.Type)}>
						{row.original.Type ?? "unknown"}
					</Badge>
				),
			},
			{
				id: "action",
				accessorFn: (event) => event.Action ?? "",
				header: ({ column }) => (
					<SortableHeader column={column} title={t("docker.events.action")} />
				),
				cell: ({ row }) => (
					<Badge variant={getActionVariant(row.original.Action)}>
						{row.original.Action ?? "-"}
					</Badge>
				),
			},
			{
				id: "resource",
				accessorFn: (event) => getResource(event),
				header: ({ column }) => (
					<SortableHeader column={column} title={t("docker.events.resource")} />
				),
				cell: ({ row }) => {
					const resource = getResource(row.original);
					return (
						<div
							className="max-w-[220px] truncate font-mono text-xs"
							title={resource}
						>
							{resource}
						</div>
					);
				},
			},
			{
				id: "attributes",
				accessorFn: (event) => getAttributesText(event),
				header: t("docker.events.attributes"),
				enableSorting: false,
				cell: ({ row }) => {
					const attributesText = getAttributesText(row.original);
					return (
						<div
							className="max-w-[360px] truncate text-xs text-muted-foreground"
							title={attributesText}
						>
							{attributesText}
						</div>
					);
				},
			},
		],
		[t],
	);

	const table = useReactTable({
		data: filteredEvents,
		columns,
		getRowId: (row) => row.key,
		state: {
			sorting,
			pagination,
		},
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<CardTitle className="text-xl flex flex-row gap-2">
									<Activity className="size-6 text-muted-foreground self-center" />
									{t("docker.events.title")}
								</CardTitle>
								<CardDescription>
									{t("docker.events.description")}
								</CardDescription>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => refetch()}
								disabled={isRefetching}
							>
								<RefreshCw
									className={`size-4 mr-1 ${isRefetching ? "animate-spin" : ""}`}
								/>
								{t("docker.events.refresh")}
							</Button>
						</div>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						{error && (
							<p className="text-sm text-destructive">{error.message}</p>
						)}
						<div className="flex flex-wrap items-center gap-2">
							<Input
								placeholder={t("docker.events.filterPlaceholder")}
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setPagination((prev) => ({ ...prev, pageIndex: 0 }));
								}}
								className="max-w-xs"
							/>
							<Select
								value={String(minutes)}
								onValueChange={(value) => setMinutes(Number(value))}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{RANGE_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={String(option.value)}>
											{t(option.labelKey)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="rounded-md border overflow-x-auto">
							<Table>
								<TableHeader>
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => (
												<TableHead key={header.id}>
													{header.isPlaceholder
														? null
														: flexRender(
																header.column.columnDef.header,
																header.getContext(),
															)}
												</TableHead>
											))}
										</TableRow>
									))}
								</TableHeader>
								<TableBody>
									{isLoading ? (
										<TableRow>
											<TableCell
												colSpan={columns.length}
												className="h-24 text-center text-muted-foreground"
											>
												<div className="flex flex-row items-center justify-center gap-2">
													<span>{t("docker.events.loading")}</span>
													<Loader2 className="size-4 animate-spin" />
												</div>
											</TableCell>
										</TableRow>
									) : table.getRowModel().rows?.length ? (
										table.getRowModel().rows.map((row) => (
											<TableRow key={row.id}>
												{row.getVisibleCells().map((cell) => (
													<TableCell key={cell.id}>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
													</TableCell>
												))}
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell
												colSpan={columns.length}
												className="h-24 text-center text-muted-foreground"
											>
												{t("docker.events.noEvents")}
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						{table.getPageCount() > 1 && (
							<div className="flex items-center justify-end gap-4">
								<span className="text-sm text-muted-foreground">
									{t("docker.common.pageOf", {
										current: table.getState().pagination.pageIndex + 1,
										total: table.getPageCount(),
									})}
								</span>
								<div className="flex items-center gap-2">
									<span className="text-sm text-muted-foreground">
										{t("docker.events.goTo")}
									</span>
									<Input
										type="number"
										min={1}
										max={table.getPageCount()}
										defaultValue={table.getState().pagination.pageIndex + 1}
										key={table.getState().pagination.pageIndex}
										onKeyDown={(e) => {
											if (e.key !== "Enter") return;
											const value = Number(
												(e.target as HTMLInputElement).value,
											);
											if (!Number.isFinite(value)) return;
											const page = Math.min(
												Math.max(value, 1),
												table.getPageCount(),
											);
											table.setPageIndex(page - 1);
										}}
										onBlur={(e) => {
											const value = Number(e.target.value);
											if (!Number.isFinite(value)) return;
											const page = Math.min(
												Math.max(value, 1),
												table.getPageCount(),
											);
											table.setPageIndex(page - 1);
										}}
										className="w-16 h-8"
									/>
								</div>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => table.previousPage()}
										disabled={!table.getCanPreviousPage()}
									>
										{t("docker.common.previous")}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => table.nextPage()}
										disabled={!table.getCanNextPage()}
									>
										{t("docker.common.next")}
									</Button>
								</div>
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
