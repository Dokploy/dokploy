import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import copy from "copy-to-clipboard";
import { format, formatDistanceToNow, isValid } from "date-fns";
import { ArrowUpDown, Copy, KeyRound, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api, type RouterOutputs } from "@/utils/api";
import { CreateSecret } from "./create-secret";
import { DeleteSecret } from "./delete-secret";

interface Props {
	serverId?: string;
}
type Secret = RouterOutputs["dockerSecret"]["list"][number];

const composeExample = `services:
  mysql:
    image: mysql:8.4
    environment:
      MYSQL_PASSWORD_FILE: /run/secrets/mysql_password
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql_root_password
    secrets:
      - mysql_password
      - mysql_root_password

secrets:
  mysql_password:
    external: true
    name: \${MYSQL_PASSWORD_SECRET:?Set the application password secret for this environment}
  mysql_root_password:
    external: true
    name: \${MYSQL_ROOT_PASSWORD_SECRET:?Set the root password secret for this environment}`;

export const ShowSecrets = ({ serverId }: Props) => {
	const [exampleOpen, setExampleOpen] = useState(false);

	return (
		<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="space-y-1.5">
							<CardTitle className="flex items-center gap-2">
								<KeyRound className="size-5" />
								Swarm Secrets
							</CardTitle>
							<CardDescription>
								Create secrets and see which services use them on this Swarm.
							</CardDescription>
						</div>
						<Button variant="outline" onClick={() => setExampleOpen(true)}>
							Use in a stack
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<AlertBlock>
						Docker never returns a secret value after creation. Values cannot be
						viewed or changed in place. To rotate a secret, create a new secret
						with a new name, then update your stack.
					</AlertBlock>
					<SecretList serverId={serverId} />
				</CardContent>
			</div>
			<Dialog open={exampleOpen} onOpenChange={setExampleOpen}>
				<DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Use external secrets in a stack</DialogTitle>
						<DialogDescription>
							Create the secrets on the same Swarm manager that deploys your
							stack. Select the Stack deployment type in Dokploy.
						</DialogDescription>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Set MYSQL_PASSWORD_SECRET and MYSQL_ROOT_PASSWORD_SECRET to the
						secret names in your stack environment. Your MySQL service also
						needs its usual database, user, and persistent storage settings.
					</p>
					<pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs">
						{composeExample}
					</pre>
					<AlertBlock>
						Swarm secrets are mounted as files. Ordinary Docker Compose
						deployments cannot use external Swarm secrets. Creating a secret
						does not attach it to a service automatically.
					</AlertBlock>
				</DialogContent>
			</Dialog>
		</Card>
	);
};

const SecretList = ({ serverId }: Props) => {
	const list = api.dockerSecret.list.useQuery({ serverId }, { retry: false });
	const [filter, setFilter] = useState("");
	const [pageIndex, setPageIndex] = useState(0);
	const [sorting, setSorting] = useState<SortingState>([]);
	const { refetch } = list;
	const refresh = useCallback(() => {
		void refetch();
	}, [refetch]);
	const filteredRows = useMemo(
		() =>
			list.data?.filter((secret) =>
				`${secret.name} ${secret.id} ${secret.services.map((service) => `${service.name} ${service.stack ?? ""}`).join(" ")}`
					.toLowerCase()
					.includes(filter.toLowerCase()),
			) ?? [],
		[list.data, filter],
	);
	const columns = useMemo<ColumnDef<Secret>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Name",
				cell: ({ row: { original: secret } }) => (
					<>
						<div className="flex items-center gap-2">
							<span className="font-medium break-all">{secret.name}</span>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Copy name of ${secret.name}`}
								title="Copy secret name"
								onClick={() => {
									if (copy(secret.name)) toast.success("Secret name copied");
									else toast.error("Could not copy secret name");
								}}
							>
								<Copy className="size-4 text-muted-foreground" />
							</Button>
						</div>
						<div className="font-mono text-xs text-muted-foreground">
							{secret.id}
						</div>
					</>
				),
			},
			{
				id: "usageCount",
				accessorFn: (secret) => secret.services.length,
				header: "Used by",
				cell: ({ row: { original: secret } }) => (
					<span className="text-muted-foreground whitespace-nowrap">
						{secret.services.length}{" "}
						{secret.services.length === 1 ? "service" : "services"}
					</span>
				),
			},
			{
				id: "services",
				header: "Service references",
				enableSorting: false,
				cell: ({ row: { original: secret } }) =>
					secret.services.length ? (
						<div className="space-y-2">
							{secret.services.map((service) => (
								<div
									key={service.id}
									className="flex flex-wrap items-center gap-2"
								>
									<span className="font-medium break-all">{service.name}</span>
									{service.stack && (
										<Badge variant="secondary">{service.stack}</Badge>
									)}
									<span className="text-xs text-muted-foreground">
										{service.current ? "Current" : ""}
										{service.current && service.rollback
											? " and rollback"
											: service.rollback
												? "Rollback"
												: ""}
									</span>
								</div>
							))}
						</div>
					) : (
						<Badge variant="outline">Unused</Badge>
					),
			},
			{
				id: "createdAt",
				accessorFn: (secret) =>
					secret.createdAt ? new Date(secret.createdAt).getTime() || 0 : 0,
				header: "Created",
				cell: ({ row: { original: secret } }) => {
					const date = secret.createdAt ? new Date(secret.createdAt) : null;
					return date && isValid(date) ? (
						<div className="text-muted-foreground whitespace-nowrap">
							<time dateTime={date.toISOString()}>{format(date, "PP")}</time>
							<div>{formatDistanceToNow(date, { addSuffix: true })}</div>
						</div>
					) : (
						<span className="text-muted-foreground">Unknown</span>
					);
				},
			},
			{
				id: "actions",
				header: () => <div className="text-right">Actions</div>,
				enableSorting: false,
				cell: ({ row: { original: secret } }) => (
					<div className="flex items-center justify-end gap-3">
						<DeleteSecret
							secretId={secret.id}
							name={secret.name}
							serverId={serverId}
							disabled={!!secret.services.length}
							onRefresh={refresh}
						/>
					</div>
				),
			},
		],
		[refresh, serverId],
	);
	const table = useReactTable({
		data: filteredRows,
		columns,
		state: { sorting },
		onSortingChange: (next) => {
			setSorting(next);
			setPageIndex(0);
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});
	const pageCount = Math.max(1, Math.ceil(filteredRows.length / 10));
	const currentPage = Math.min(pageIndex, pageCount - 1);
	const rows = table
		.getRowModel()
		.rows.slice(currentPage * 10, (currentPage + 1) * 10);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="w-full max-w-sm">
					<Input
						aria-label="Search secrets or services"
						placeholder="Search secrets or services..."
						className="max-w-sm"
						value={filter}
						onChange={(event) => {
							setFilter(event.target.value);
							setPageIndex(0);
						}}
					/>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={refresh}
						disabled={list.isFetching}
					>
						<RefreshCw
							className={`size-4 ${list.isFetching ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
					<CreateSecret
						serverId={serverId}
						disabled={list.isPending || !!list.error}
					/>
				</div>
			</div>
			{list.error ? (
				<AlertBlock type="error" role="alert">
					{list.error.message}
				</AlertBlock>
			) : list.isPending && !list.data ? (
				<p role="status">Loading secrets...</p>
			) : (
				<div className="rounded-md border overflow-x-auto">
					<Table>
						<TableHeader>
							{table.getHeaderGroups().map((group) => (
								<TableRow key={group.id}>
									{group.headers.map((header) => (
										<TableHead
											key={header.id}
											aria-sort={
												header.column.getCanSort()
													? header.column.getIsSorted() === "asc"
														? "ascending"
														: header.column.getIsSorted() === "desc"
															? "descending"
															: "none"
													: undefined
											}
										>
											{header.column.getCanSort() ? (
												<Button
													variant="ghost"
													className="-ml-3 h-8"
													onClick={() =>
														header.column.toggleSorting(
															header.column.getIsSorted() === "asc",
														)
													}
												>
													{flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
													<ArrowUpDown className="ml-2 size-4" />
												</Button>
											) : (
												flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)
											)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.original.id}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))}
							{!rows.length && (
								<TableRow>
									<TableCell
										colSpan={columns.length}
										className="h-24 text-center text-muted-foreground"
									>
										{filter
											? "No matching secrets."
											: "No secrets on this Swarm. Create a secret to get started."}
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}
			{filteredRows.length > 10 && (
				<div className="flex items-center justify-between gap-3 text-sm">
					<span className="text-muted-foreground">
						{filteredRows.length} secrets, page {currentPage + 1} of {pageCount}
					</span>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === 0}
							onClick={() => setPageIndex(currentPage - 1)}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage + 1 >= pageCount}
							onClick={() => setPageIndex(currentPage + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			)}
			<p className="text-xs text-muted-foreground">
				Deletion is blocked while a service or its rollback specification
				references the secret, including services scaled to zero.
			</p>
		</div>
	);
};
