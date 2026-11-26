import { Loader2, MoreHorizontal, Network } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { readableErrorMessage } from "@/utils/error-message";
import { AddVmDialog, EnableMeshDialog } from "./mesh-dialogs";

type Mesh = NonNullable<RouterOutputs["clusterMesh"]["get"]>;
type MeshNode = Mesh["nodes"][number];

const STATUS_BADGES: Record<
	MeshNode["status"],
	{ label: string; variant: "green" | "blue" | "yellow" | "red" | "blank" }
> = {
	provisioning: { label: "Setting up", variant: "blue" },
	paused: { label: "Paused", variant: "yellow" },
	active: { label: "Active", variant: "green" },
	drained: { label: "Drained", variant: "blank" },
	error: { label: "Failed", variant: "red" },
	removing: { label: "Removing", variant: "blue" },
};

const BUSY = new Set<MeshNode["status"]>(["provisioning", "removing"]);

const formatAge = (seconds: number | null | undefined) => {
	if (seconds === undefined) return "—";
	if (seconds === null) return "Never";
	if (seconds < 60) return `${seconds}s ago`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	return `${Math.floor(seconds / 3600)}h ago`;
};

const NodeLogDialog = ({
	node,
	onClose,
}: {
	node: MeshNode | null;
	onClose: () => void;
}) => {
	const { data } = api.clusterMesh.log.useQuery(
		{ clusterNodeId: node?.clusterNodeId ?? "" },
		{
			enabled: !!node,
			refetchInterval: (query) =>
				query.state.data && BUSY.has(query.state.data.status) ? 2000 : false,
		},
	);
	return (
		<Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Setup log: {node?.name}</DialogTitle>
					<DialogDescription>
						Every step Dokploy ran on the VM, newest last.
					</DialogDescription>
				</DialogHeader>
				{data?.lastError && (
					<AlertBlock type="error">{data.lastError}</AlertBlock>
				)}
				<pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 font-mono text-xs">
					{data?.log || "No output yet."}
				</pre>
			</DialogContent>
		</Dialog>
	);
};

const ActivateDialog = ({
	node,
	meshId,
	onClose,
	onDone,
}: {
	node: MeshNode | null;
	meshId: string;
	onClose: () => void;
	onDone: () => Promise<unknown>;
}) => {
	const { data: findings, isLoading } = api.clusterMesh.preflight.useQuery(
		{ meshId },
		{ enabled: !!node },
	);
	const { mutateAsync, isPending } = api.clusterMesh.activateNode.useMutation();
	const activate = async () => {
		if (!node) return;
		await mutateAsync({
			clusterNodeId: node.clusterNodeId,
			acknowledgeFindings: (findings?.length ?? 0) > 0,
		})
			.then(() => {
				toast.success(`${node.name} can now run replicas`);
				onClose();
			})
			.catch((error) =>
				toast.error(readableErrorMessage(error, "Could not activate the VM")),
			);
		await onDone();
	};
	return (
		<Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Activate {node?.name}?</DialogTitle>
					<DialogDescription>
						Swarm can then place replicas on this VM. Services that are not
						pinned to a node may move there on their next deploy or scale.
					</DialogDescription>
				</DialogHeader>
				{isLoading && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Checking services…
					</div>
				)}
				{findings && findings.length === 0 && (
					<AlertBlock type="success">
						No service depends on data or images that exist only on the manager.
					</AlertBlock>
				)}
				{findings && findings.length > 0 && (
					<div className="flex flex-col gap-2">
						<AlertBlock type="warning">
							{findings.length} service(s) could fail if Swarm places them on
							this VM. Fix them first, or activate anyway.
						</AlertBlock>
						<ul className="flex max-h-72 flex-col gap-2 overflow-auto">
							{findings.map((finding) => (
								<li
									key={`${finding.id}-${finding.serviceName}-${finding.reason}`}
									className="rounded-md border p-3 text-sm"
								>
									<Link href={finding.href} className="font-medium underline">
										{finding.name}
										{finding.serviceName ? ` · ${finding.serviceName}` : ""}
									</Link>
									<p className="text-muted-foreground">{finding.reason}</p>
								</li>
							))}
						</ul>
					</div>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant={findings?.length ? "destructive" : "default"}
						disabled={isLoading}
						isLoading={isPending}
						onClick={activate}
					>
						{findings?.length ? "Activate anyway" : "Activate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

const PoolDialog = ({
	node,
	onClose,
	onDone,
}: {
	node: MeshNode | null;
	onClose: () => void;
	onDone: () => Promise<unknown>;
}) => {
	const [pool, setPool] = useState("");
	const { mutateAsync, isPending } = api.clusterMesh.setNodePool.useMutation();
	useEffect(() => setPool(node?.pool ?? ""), [node]);
	const valid = pool === "" || /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(pool);
	const save = async () => {
		if (!node) return;
		await mutateAsync({ clusterNodeId: node.clusterNodeId, pool: pool || null })
			.then(() =>
				toast.success(
					pool ? `${node.name} is in pool ${pool}` : "Pool cleared",
				),
			)
			.catch((error) =>
				toast.error(readableErrorMessage(error, "Could not set the pool")),
			);
		await onDone();
		onClose();
	};
	return (
		<Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Pool of {node?.name}</DialogTitle>
					<DialogDescription>
						Group VMs into pools, then choose "A node pool" in an application's
						or stack service's Placement to run it only there. Takes effect for
						those services on their next deploy.
					</DialogDescription>
				</DialogHeader>
				<Input
					placeholder="web"
					value={pool}
					onChange={(event) => setPool(event.target.value.trim())}
					aria-label="Pool name"
				/>
				{!valid && (
					<p className="text-sm text-red-600 dark:text-red-400">
						Use letters, digits, dots and dashes.
					</p>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button disabled={!valid} isLoading={isPending} onClick={save}>
						{pool ? "Save" : "Clear pool"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

const NodeActions = ({
	node,
	canManage,
	onLog,
	onActivate,
	onPool,
	onChanged,
}: {
	node: MeshNode;
	canManage: boolean;
	onLog: () => void;
	onActivate: () => void;
	onPool: () => void;
	onChanged: () => Promise<unknown>;
}) => {
	const setAvailability = api.clusterMesh.setAvailability.useMutation();
	const retry = api.clusterMesh.retryNode.useMutation();
	const remove = api.clusterMesh.removeNode.useMutation();
	const run = async (action: Promise<unknown>, success: string) => {
		await action
			.then(() => toast.success(success))
			.catch((error) => toast.error(readableErrorMessage(error, "Failed")));
		await onChanged();
	};
	const isWorker = node.role === "worker";
	const busy = BUSY.has(node.status);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Actions for ${node.name}`}
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onSelect={onLog}>View setup log</DropdownMenuItem>
				{canManage && node.swarmNodeId && !busy && (
					<DropdownMenuItem onSelect={onPool}>Set pool</DropdownMenuItem>
				)}
				{canManage && node.status === "error" && (
					<DropdownMenuItem
						onSelect={() =>
							run(
								retry.mutateAsync({ clusterNodeId: node.clusterNodeId }),
								`Retrying ${node.name}`,
							)
						}
					>
						Retry setup
					</DropdownMenuItem>
				)}
				{canManage && isWorker && !busy && node.swarmNodeId && (
					<>
						<DropdownMenuSeparator />
						{node.status !== "active" && (
							<DropdownMenuItem onSelect={onActivate}>
								Activate
							</DropdownMenuItem>
						)}
						{node.status !== "paused" && (
							<DropdownMenuItem
								onSelect={() =>
									run(
										setAvailability.mutateAsync({
											clusterNodeId: node.clusterNodeId,
											availability: "pause",
										}),
										`${node.name} paused: it keeps its replicas but gets no new ones`,
									)
								}
							>
								Pause
							</DropdownMenuItem>
						)}
						{node.status !== "drained" && (
							<DropdownMenuItem
								onSelect={() =>
									run(
										setAvailability.mutateAsync({
											clusterNodeId: node.clusterNodeId,
											availability: "drain",
										}),
										`Draining ${node.name}: its replicas move to other nodes`,
									)
								}
							>
								Drain
							</DropdownMenuItem>
						)}
					</>
				)}
				{canManage && isWorker && node.status !== "removing" && (
					<>
						<DropdownMenuSeparator />
						<DialogAction
							title={`Remove ${node.name}?`}
							description="Dokploy drains the VM, makes it leave the swarm, removes it from every node's tunnel and uninstalls its WireGuard configuration. Docker stays installed."
							type="destructive"
							onClick={() =>
								run(
									remove.mutateAsync({
										clusterNodeId: node.clusterNodeId,
										force: false,
									}),
									`Removing ${node.name}`,
								)
							}
						>
							<DropdownMenuItem
								className="text-red-600 dark:text-red-400"
								onSelect={(event) => event.preventDefault()}
							>
								Remove
							</DropdownMenuItem>
						</DialogAction>
						<DialogAction
							title={`Force remove ${node.name}?`}
							description="For a VM that is gone or unreachable. Dokploy removes it from the swarm and from every other node's tunnel without connecting to it. Its replicas are rescheduled elsewhere."
							type="destructive"
							onClick={() =>
								run(
									remove.mutateAsync({
										clusterNodeId: node.clusterNodeId,
										force: true,
									}),
									`Force removing ${node.name}`,
								)
							}
						>
							<DropdownMenuItem
								className="text-red-600 dark:text-red-400"
								onSelect={(event) => event.preventDefault()}
							>
								Force remove (VM unreachable)
							</DropdownMenuItem>
						</DialogAction>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export const ShowClusterMesh = ({ serverId }: { serverId?: string }) => {
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canManage = !!permissions?.server.create;
	const utils = api.useUtils();
	const {
		data: mesh,
		isLoading,
		error,
	} = api.clusterMesh.get.useQuery(
		{ serverId },
		{
			refetchInterval: (query) =>
				query.state.data?.status === "provisioning" ||
				query.state.data?.nodes.some((node) => BUSY.has(node.status))
					? 3000
					: 15000,
		},
	);
	const { data: handshakes } = api.clusterMesh.handshakes.useQuery(
		{ meshId: mesh?.meshId ?? "" },
		{
			enabled: mesh?.status === "ready" && mesh.nodes.length > 1,
			refetchInterval: 30000,
			retry: false,
		},
	);
	const disable = api.clusterMesh.disable.useMutation();
	const retry = api.clusterMesh.retryNode.useMutation();
	const [logNode, setLogNode] = useState<MeshNode | null>(null);
	const [activateNode, setActivateNode] = useState<MeshNode | null>(null);
	const [poolNode, setPoolNode] = useState<MeshNode | null>(null);
	const refresh = () => utils.clusterMesh.get.invalidate({ serverId });
	const manager = mesh?.nodes.find((node) => node.role === "manager");
	const workers = mesh?.nodes.filter((node) => node.role === "worker") ?? [];

	return (
		<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
					<div className="flex flex-col gap-2">
						<CardTitle className="flex flex-row gap-2 text-xl">
							<Network className="size-6 self-center text-muted-foreground" />
							Multi-VM networking
						</CardTitle>
						<CardDescription>
							Join VMs from any provider to this swarm over an encrypted
							WireGuard tunnel, so replicas and load balancing span all of them.
						</CardDescription>
					</div>
					{canManage && !mesh && !isLoading && (
						<EnableMeshDialog serverId={serverId} />
					)}
					{canManage && mesh?.status === "ready" && (
						<AddVmDialog
							meshId={mesh.meshId}
							serverId={serverId}
							listenPort={mesh.listenPort}
						/>
					)}
				</CardHeader>
				<CardContent className="flex flex-col gap-4 border-t py-6">
					{isLoading && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							Loading…
						</div>
					)}
					{error && <AlertBlock type="error">{error.message}</AlertBlock>}
					{!isLoading && !mesh && (
						<p className="text-sm text-muted-foreground">
							Not set up. The swarm runs on this machine only. Setting up
							installs WireGuard on the manager; its swarm and services keep
							running unchanged.
						</p>
					)}
					{mesh?.status === "provisioning" && (
						<AlertBlock type="info">
							Setting up WireGuard on the manager…{" "}
							<button
								type="button"
								className="underline"
								onClick={() => manager && setLogNode(manager)}
							>
								View log
							</button>
						</AlertBlock>
					)}
					{mesh?.status === "error" && (
						<AlertBlock type="error">
							Setup failed: {mesh.lastError}{" "}
							{canManage && manager && (
								<button
									type="button"
									className="underline"
									onClick={async () => {
										await retry
											.mutateAsync({ clusterNodeId: manager.clusterNodeId })
											.catch((err) =>
												toast.error(readableErrorMessage(err, "Retry failed")),
											);
										await refresh();
									}}
								>
									Retry
								</button>
							)}
						</AlertBlock>
					)}
					{mesh && (
						<>
							<div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
								<span>
									Tunnel subnet <span className="font-mono">{mesh.subnet}</span>
								</span>
								<span>
									Manager swarm address{" "}
									<span className="font-mono">
										{mesh.managerAdvertiseAddress}
									</span>
								</span>
								<span>
									UDP port <span className="font-mono">{mesh.listenPort}</span>
								</span>
								<span>
									Tunnel MTU <span className="font-mono">{mesh.wgMtu}</span>
								</span>
							</div>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Role</TableHead>
											<TableHead>Public address</TableHead>
											<TableHead>Tunnel address</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Swarm</TableHead>
											<TableHead>Pool</TableHead>
											<TableHead>Last handshake</TableHead>
											<TableHead className="w-12" />
										</TableRow>
									</TableHeader>
									<TableBody>
										{mesh.nodes.map((node) => {
											const badge = STATUS_BADGES[node.status];
											return (
												<TableRow key={node.clusterNodeId}>
													<TableCell className="font-medium">
														{node.name}
													</TableCell>
													<TableCell className="capitalize">
														{node.role}
													</TableCell>
													<TableCell className="font-mono text-xs">
														{node.endpointAddress}
													</TableCell>
													<TableCell className="font-mono text-xs">
														{node.wgAddress}
													</TableCell>
													<TableCell>
														<Badge variant={badge.variant}>
															{BUSY.has(node.status) && (
																<Loader2 className="mr-1 size-3 animate-spin" />
															)}
															{badge.label}
														</Badge>
													</TableCell>
													<TableCell className="text-sm">
														{node.swarmState
															? `${node.swarmState} · ${node.swarmAvailability}`
															: "—"}
													</TableCell>
													<TableCell className="font-mono text-xs">
														{node.pool ?? "—"}
													</TableCell>
													<TableCell className="text-sm">
														{node.role === "manager"
															? "—"
															: formatAge(handshakes?.[node.clusterNodeId])}
													</TableCell>
													<TableCell>
														<NodeActions
															node={node}
															canManage={canManage}
															onLog={() => setLogNode(node)}
															onActivate={() => setActivateNode(node)}
															onPool={() => setPoolNode(node)}
															onChanged={refresh}
														/>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
							{workers.some((node) => node.status === "paused") && (
								<AlertBlock type="info">
									Paused VMs are in the swarm but get no replicas. Activate a VM
									once the services listed in its activation check are ready to
									run there.
								</AlertBlock>
							)}
							{canManage &&
								workers.length === 0 &&
								mesh.status !== "provisioning" && (
									<DialogAction
										title="Turn off multi-VM networking?"
										description="Dokploy removes WireGuard from the manager. Its swarm and services are not touched."
										type="destructive"
										onClick={async () => {
											await disable
												.mutateAsync({ meshId: mesh.meshId })
												.then(() =>
													toast.success("Multi-VM networking turned off"),
												)
												.catch((err) =>
													toast.error(
														readableErrorMessage(err, "Could not turn it off"),
													),
												);
											await refresh();
										}}
									>
										<Button variant="outline" className="w-fit">
											Turn off
										</Button>
									</DialogAction>
								)}
						</>
					)}
				</CardContent>
			</div>
			<NodeLogDialog node={logNode} onClose={() => setLogNode(null)} />
			<PoolDialog
				node={poolNode}
				onClose={() => setPoolNode(null)}
				onDone={refresh}
			/>
			{mesh && (
				<ActivateDialog
					node={activateNode}
					meshId={mesh.meshId}
					onClose={() => setActivateNode(null)}
					onDone={refresh}
				/>
			)}
		</Card>
	);
};
