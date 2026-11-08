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
import {
	ArrowUpDown,
	Copy,
	KeyRound,
	Loader2,
	LockKeyhole,
	Plus,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, type RouterOutputs } from "@/utils/api";
import { DeleteSecret } from "./delete-secret";

interface Props {
	serverId?: string;
}
type Grant = RouterOutputs["dockerSecret"]["unlock"];
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
	const status = api.dockerSecret.status.useQuery(
		{ serverId },
		{ retry: false },
	);
	const unlock = api.dockerSecret.unlock.useMutation({ gcTime: 0 });
	const lock = api.dockerSecret.lock.useMutation({ gcTime: 0 });
	const [grant, setGrant] = useState<Grant | null>(null);
	const [credential, setCredential] = useState("");
	const [error, setError] = useState("");
	const [exampleOpen, setExampleOpen] = useState(false);

	useEffect(() => {
		if (!grant) return;
		const timer = setTimeout(
			() => setGrant(null),
			Math.max(0, grant.expiresAt - Date.now()),
		);
		return () => clearTimeout(timer);
	}, [grant]);

	const lockAccess = () => {
		setGrant(null);
		setCredential("");
		lock.mutate({ serverId });
	};

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
						viewed or edited here. To rotate a secret, create one with a new
						name and update your stack.
					</AlertBlock>
					{status.isLoading ? (
						<p role="status">Checking Swarm manager...</p>
					) : status.error ? (
						<div className="space-y-3">
							<AlertBlock type="error">{status.error.message}</AlertBlock>
							<Button variant="outline" onClick={() => status.refetch()}>
								Try again
							</Button>
						</div>
					) : grant ? (
						<UnlockedSecrets
							key={grant.token}
							serverId={serverId}
							grant={grant}
							onLock={lockAccess}
						/>
					) : status.data?.method === "unavailable" ? (
						<AlertBlock type="warning">
							Set an account password or enable two-factor authentication in
							your profile before managing Swarm secrets.
						</AlertBlock>
					) : (
						<form
							className="mx-auto max-w-md space-y-4 rounded-xl border p-6"
							onSubmit={async (event) => {
								event.preventDefault();
								setError("");
								try {
									setGrant(await unlock.mutateAsync({ serverId, credential }));
								} catch (cause) {
									setError(
										cause instanceof Error
											? cause.message
											: "Could not verify your identity.",
									);
								} finally {
									setCredential("");
									unlock.reset();
								}
							}}
						>
							<div className="flex items-center gap-2 font-medium">
								<LockKeyhole className="size-4" />
								Verify your identity
							</div>
							<p className="text-sm text-muted-foreground">
								Access lasts five minutes and is limited to this server.
							</p>
							<div className="space-y-2">
								<Label htmlFor="secret-credential">
									{status.data?.method === "totp"
										? "Authenticator code"
										: "Account password"}
								</Label>
								<Input
									id="secret-credential"
									type={status.data?.method === "totp" ? "text" : "password"}
									autoComplete={
										status.data?.method === "totp"
											? "one-time-code"
											: "current-password"
									}
									inputMode={
										status.data?.method === "totp" ? "numeric" : undefined
									}
									maxLength={status.data?.method === "totp" ? 6 : 1024}
									value={credential}
									onChange={(event) => setCredential(event.target.value)}
									required
									disabled={unlock.isPending}
								/>
							</div>
							{error && (
								<AlertBlock type="error" role="alert">
									{error}
								</AlertBlock>
							)}
							<Button
								type="submit"
								disabled={unlock.isPending || !credential}
								className="w-full"
							>
								{unlock.isPending && (
									<Loader2 className="size-4 animate-spin" />
								)}
								Unlock secrets
							</Button>
						</form>
					)}
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

const UnlockedSecrets = ({
	serverId,
	grant,
	onLock,
}: Props & { grant: Grant; onLock: () => void }) => {
	const utils = api.useUtils();
	const list = api.dockerSecret.list.useMutation({ gcTime: 0 });
	const create = api.dockerSecret.create.useMutation({
		gcTime: 0,
		onSuccess: () => utils.dockerSecret.count.invalidate({ serverId }),
	});
	const [filter, setFilter] = useState("");
	const [pageIndex, setPageIndex] = useState(0);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [value, setValue] = useState("");
	const [error, setError] = useState("");
	const input = { serverId, token: grant.token };
	const { mutate: load } = list;
	const refresh = useCallback(
		() => load({ serverId, token: grant.token }),
		[load, serverId, grant.token],
	);
	useEffect(() => {
		load({ serverId, token: grant.token });
	}, [load, serverId, grant.token]);
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
					<div className="text-right">
						<DeleteSecret
							secretId={secret.id}
							name={secret.name}
							serverId={serverId}
							token={grant.token}
							disabled={!!secret.services.length || list.isPending}
							onRefresh={refresh}
						/>
					</div>
				),
			},
		],
		[grant.token, list.isPending, refresh, serverId],
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
	const changeOpen = (next: boolean) => {
		setOpen(next);
		if (!next) {
			setName("");
			setValue("");
			setError("");
		}
	};

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
					<Button variant="outline" onClick={onLock}>
						<LockKeyhole className="size-4" />
						Lock
					</Button>
					<Button variant="outline" onClick={refresh} disabled={list.isPending}>
						<RefreshCw
							className={`size-4 ${list.isPending ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
					<Button onClick={() => changeOpen(true)}>
						<Plus className="size-4" />
						Create secret
					</Button>
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
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!create.isPending) changeOpen(next);
				}}
			>
				<DialogContent className="max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Create Swarm secret</DialogTitle>
						<DialogDescription>
							The value is sent to Docker and cannot be retrieved after
							creation. Keep a copy in your password manager if needed.
						</DialogDescription>
					</DialogHeader>
					<form
						className="space-y-4"
						onSubmit={async (event) => {
							event.preventDefault();
							setError("");
							try {
								await create.mutateAsync({ ...input, name, value });
								toast.success("Secret created");
								changeOpen(false);
								refresh();
							} catch (cause) {
								setError(
									cause instanceof Error
										? cause.message
										: "Could not create the secret.",
								);
							} finally {
								setValue("");
								create.reset();
							}
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="secret-name">Name</Label>
							<Input
								id="secret-name"
								maxLength={64}
								pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
								placeholder="mysql_password_production_v1"
								value={name}
								onChange={(event) => setName(event.target.value)}
								required
								disabled={create.isPending}
							/>
							<p className="text-xs text-muted-foreground">
								1 to 64 letters, numbers, dots, underscores, or hyphens. Start
								with a letter or number.
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="secret-value">Value</Label>
							<Textarea
								id="secret-value"
								autoComplete="off"
								spellCheck={false}
								rows={5}
								maxLength={500 * 1024 - 1}
								value={value}
								onChange={(event) => setValue(event.target.value)}
								required
								disabled={create.isPending}
							/>
							<p className="text-xs text-muted-foreground">
								Text or a multiline key, less than 500 KiB. Whitespace is
								preserved.
							</p>
						</div>
						{error && (
							<AlertBlock type="error" role="alert">
								{error}
							</AlertBlock>
						)}
						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => changeOpen(false)}
								disabled={create.isPending}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={create.isPending || !name || !value}
							>
								{create.isPending && (
									<Loader2 className="size-4 animate-spin" />
								)}
								Create secret
							</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
};
