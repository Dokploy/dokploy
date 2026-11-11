import { formatMb } from "@dokploy/server/monitoring/units";
import {
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import * as React from "react";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { columns } from "./columns";

interface Props {
	serverId?: string;
}

export const ShowResourceUsage = ({ serverId }: Props) => {
	const { data, isPending, refetch, isRefetching } =
		api.project.resourceUsage.useQuery(
			{ serverId },
			{
				refetchInterval: 5_000,
			},
		);

	const [sorting, setSorting] = React.useState<SortingState>([
		{ id: "cpuPercent", desc: true },
	]);
	const [globalFilter, setGlobalFilter] = React.useState("");

	const table = useReactTable({
		data: data ?? [],
		columns,
		onSortingChange: setSorting,
		onGlobalFilterChange: setGlobalFilter,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		globalFilterFn: (row, _columnId, filterValue) => {
			const search = String(filterValue).toLowerCase();
			return (
				row.original.name.toLowerCase().includes(search) ||
				row.original.projectName.toLowerCase().includes(search) ||
				row.original.environmentName.toLowerCase().includes(search)
			);
		},
		state: {
			sorting,
			globalFilter,
		},
	});

	const totals = React.useMemo(() => {
		if (!data) return { cpu: 0, mem: 0, disk: 0, containers: 0 };
		return data.reduce(
			(acc, service) => ({
				cpu: acc.cpu + service.cpuPercent,
				mem: acc.mem + service.memUsedMb,
				disk: acc.disk + service.diskUsedMb,
				containers: acc.containers + service.containers.length,
			}),
			{ cpu: 0, mem: 0, disk: 0, containers: 0 },
		);
	}, [data]);

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Cpu className="size-6 text-muted-foreground self-center" />
							Resource Usage
						</CardTitle>
						<CardDescription>
							CPU, memory, and storage usage per project, application, and
							container
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						<div className="flex flex-wrap gap-4">
							<div className="flex items-center gap-2 rounded-lg border px-4 py-2">
								<Cpu className="size-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									Total CPU:
								</span>
								<span className="font-medium">{totals.cpu.toFixed(1)}%</span>
							</div>
							<div className="flex items-center gap-2 rounded-lg border px-4 py-2">
								<MemoryStick className="size-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									Total Memory:
								</span>
								<span className="font-medium">{formatMb(totals.mem)}</span>
							</div>
							<div className="flex items-center gap-2 rounded-lg border px-4 py-2">
								<HardDrive className="size-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									Total Storage:
								</span>
								<span className="font-medium">{formatMb(totals.disk)}</span>
							</div>
							<div className="flex items-center gap-2 rounded-lg border px-4 py-2">
								<span className="text-sm text-muted-foreground">
									Containers:
								</span>
								<span className="font-medium">{totals.containers}</span>
							</div>
						</div>
						<div className="flex items-center gap-2 max-sm:flex-wrap">
							<Input
								placeholder="Filter by project, environment, or service..."
								value={globalFilter}
								onChange={(event) => setGlobalFilter(event.target.value)}
								className="md:max-w-sm"
							/>
							<Button
								variant="outline"
								size="icon"
								className="shrink-0 sm:ml-auto"
								onClick={() => refetch()}
								disabled={isRefetching}
							>
								<RefreshCw
									className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
								/>
								<span className="sr-only">Refresh</span>
							</Button>
						</div>
						<div className="rounded-md border">
							{isPending ? (
								<div className="w-full flex-col gap-2 flex items-center justify-center h-[40vh]">
									<span className="text-muted-foreground text-lg font-medium">
										Loading...
									</span>
								</div>
							) : data?.length === 0 ? (
								<div className="flex-col gap-2 flex items-center justify-center h-[40vh]">
									<span className="text-muted-foreground text-lg font-medium">
										No services found on this server.
									</span>
								</div>
							) : (
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
										{table.getRowModel().rows.length ? (
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
													className="h-24 text-center"
												>
													No results.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							)}
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
