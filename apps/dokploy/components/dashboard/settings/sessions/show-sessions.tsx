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
import { format } from "date-fns";
import { ArrowUpDown, Loader2, LogOut, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
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
import { api } from "@/utils/api";

type SessionRow = {
	id: string;
	userId: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date;
	expiresAt: Date;
	isCurrent: boolean;
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
		size="sm"
		className="-ml-3 h-8"
		onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
	>
		{title}
		<ArrowUpDown className="ml-2 size-3.5" />
	</Button>
);

export const ShowSessions = () => {
	const { data: auth } = api.user.get.useQuery();
	const isOwner = auth?.role === "owner";
	const {
		data: sessions,
		isPending,
		refetch,
	} = api.user.listSessions.useQuery();
	const { mutateAsync: revoke, isPending: isRevoking } =
		api.user.revokeSession.useMutation();
	const { data: members } = api.user.all.useQuery(undefined, {
		enabled: isOwner,
	});

	const [statusFilter, setStatusFilter] = useState<
		"all" | "active" | "expired"
	>("all");
	const [userFilter, setUserFilter] = useState("all");
	const [globalFilter, setGlobalFilter] = useState("");
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "createdAt", desc: true },
	]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const handleRevoke = async (sessionId: string) => {
		try {
			await revoke({ sessionId });
			toast.success("Session revoked successfully");
			refetch();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to revoke session",
			);
		}
	};

	const filteredData = useMemo(() => {
		let list = sessions ?? [];

		if (statusFilter !== "all") {
			list = list.filter((s) => {
				const isExpired = new Date(s.expiresAt) <= new Date();
				return statusFilter === "expired" ? isExpired : !isExpired;
			});
		}

		if (isOwner && userFilter !== "all") {
			list = list.filter((s) => s.userId === userFilter);
		}

		if (globalFilter.trim()) {
			const query = globalFilter.toLowerCase();
			list = list.filter((s) =>
				[s.ipAddress, s.userAgent ? parseUserAgent(s.userAgent) : null]
					.filter(Boolean)
					.some((field) => field?.toLowerCase().includes(query)),
			);
		}

		return list;
	}, [sessions, statusFilter, userFilter, isOwner, globalFilter]);

	const columns = useMemo<ColumnDef<SessionRow>[]>(
		() => [
			{
				id: "user",
				accessorFn: (row) => `${row.firstName} ${row.lastName} ${row.email}`,
				header: ({ column }) => <SortableHeader column={column} title="User" />,
				cell: ({ row }) => (
					<div className="flex items-center gap-1">
						<span>
							{row.original.firstName} {row.original.lastName}
						</span>
						<span className="text-muted-foreground">
							({row.original.email})
						</span>
						{row.original.isCurrent && (
							<Badge variant="secondary" className="ml-1 text-xs">
								Current
							</Badge>
						)}
					</div>
				),
			},
			{
				accessorKey: "ipAddress",
				header: ({ column }) => (
					<SortableHeader column={column} title="IP Address" />
				),
				cell: ({ row }) => (
					<span className="font-mono text-sm">
						{row.original.ipAddress || "-"}
					</span>
				),
				meta: { className: "hidden md:table-cell" },
			},
			{
				id: "device",
				accessorFn: (row) =>
					row.userAgent ? parseUserAgent(row.userAgent) : "",
				header: ({ column }) => (
					<SortableHeader column={column} title="Device" />
				),
				cell: ({ row }) => (
					<span className="max-w-[200px] truncate text-sm text-muted-foreground">
						{row.original.userAgent
							? parseUserAgent(row.original.userAgent)
							: "-"}
					</span>
				),
				meta: { className: "hidden lg:table-cell" },
			},
			{
				id: "status",
				accessorFn: (row) => (new Date(row.expiresAt) <= new Date() ? 1 : 0),
				header: ({ column }) => (
					<SortableHeader column={column} title="Status" />
				),
				cell: ({ row }) => {
					const isExpired = new Date(row.original.expiresAt) <= new Date();
					return isExpired ? (
						<Badge variant="outline" className="text-xs">
							Expired
						</Badge>
					) : (
						<Badge variant="green" className="text-xs">
							Active
						</Badge>
					);
				},
			},
			{
				accessorKey: "createdAt",
				header: ({ column }) => (
					<SortableHeader column={column} title="Active Since" />
				),
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground whitespace-nowrap">
						{format(new Date(row.original.createdAt), "MMM d, HH:mm")}
					</span>
				),
			},
			{
				accessorKey: "expiresAt",
				header: ({ column }) => (
					<SortableHeader column={column} title="Expires" />
				),
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground whitespace-nowrap">
						{format(new Date(row.original.expiresAt), "MMM d, HH:mm")}
					</span>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				header: () => <div className="text-right">Actions</div>,
				cell: ({ row }) =>
					!row.original.isCurrent && (
						<div className="flex justify-end">
							<DialogAction
								title="Revoke Session"
								description={`Force logout for ${row.original.firstName} ${row.original.lastName} (${row.original.email})?`}
								type="destructive"
								onClick={async () => handleRevoke(row.original.id)}
							>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									disabled={isRevoking}
								>
									<LogOut className="h-4 w-4 text-red-500" />
								</Button>
							</DialogAction>
						</div>
					),
			},
		],
		[isRevoking, handleRevoke],
	);

	const table = useReactTable({
		data: filteredData,
		columns,
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
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-6xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Smartphone className="size-6 text-muted-foreground self-center" />
							Sessions
						</CardTitle>
						<CardDescription>
							{isOwner
								? "Manage active sessions across your organization. Revoke sessions to force logout."
								: "Manage your active sessions. Revoke sessions to force logout."}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !sessions || sessions.length === 0 ? (
							<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
								<Smartphone className="size-8 self-center text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									No sessions found
								</span>
							</div>
						) : (
							<>
								<div className="flex flex-wrap items-center gap-2">
									<Input
										placeholder="Search by IP, device..."
										value={globalFilter}
										onChange={(e) => setGlobalFilter(e.target.value)}
										className="max-w-xs"
									/>
									<Select
										value={statusFilter}
										onValueChange={(v) =>
											setStatusFilter(v as "all" | "active" | "expired")
										}
									>
										<SelectTrigger className="w-[150px]">
											<SelectValue placeholder="Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All statuses</SelectItem>
											<SelectItem value="active">Active</SelectItem>
											<SelectItem value="expired">Expired</SelectItem>
										</SelectContent>
									</Select>
									{isOwner && (
										<Select value={userFilter} onValueChange={setUserFilter}>
											<SelectTrigger className="w-[200px]">
												<SelectValue placeholder="User" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All users</SelectItem>
												{members?.map((m) => (
													<SelectItem key={m.user.id} value={m.user.id}>
														{m.user.firstName} {m.user.lastName} ({m.user.email}
														)
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
								</div>
								<div className="rounded-md border overflow-x-auto">
									<Table>
										<TableHeader>
											{table.getHeaderGroups().map((headerGroup) => (
												<TableRow key={headerGroup.id}>
													{headerGroup.headers.map((header) => (
														<TableHead
															key={header.id}
															className={
																(header.column.columnDef.meta as any)?.className
															}
														>
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
											{table.getRowModel().rows?.length ? (
												table.getRowModel().rows.map((row) => (
													<TableRow key={row.id}>
														{row.getVisibleCells().map((cell) => (
															<TableCell
																key={cell.id}
																className={
																	(cell.column.columnDef.meta as any)?.className
																}
															>
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
														No sessions match your filters.
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
								{table.getPageCount() > 1 && (
									<div className="flex items-center justify-end gap-4">
										<span className="text-sm text-muted-foreground">
											Page {table.getState().pagination.pageIndex + 1} of{" "}
											{table.getPageCount()}
										</span>
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => table.previousPage()}
												disabled={!table.getCanPreviousPage()}
											>
												Previous
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => table.nextPage()}
												disabled={!table.getCanNextPage()}
											>
												Next
											</Button>
										</div>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

function parseUserAgent(ua: string): string {
	if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
	if (ua.includes("Edg/")) return "Edge";
	if (ua.includes("Firefox/")) return "Firefox";
	if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
	if (ua.includes("curl/") || ua.includes("wget/")) return "CLI";
	return ua.slice(0, 40) + (ua.length > 40 ? "..." : "");
}
