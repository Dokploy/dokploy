import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api, type RouterOutputs } from "@/utils/api";
import { readableErrorMessage } from "@/utils/error-message";
import { wholeNumber } from "./format";

type Placement = RouterOutputs["scaling"]["settings"]["placement"];
export type PlacementNode = RouterOutputs["scaling"]["placementNodes"][number];

export type PlacementTarget =
	| { kind: "application"; applicationId: string }
	| { kind: "compose"; composeId: string; serviceName: string };

const placementSchema = z
	.object({
		nodeTarget: z.enum(["any", "managers", "workers", "node", "nodes", "pool"]),
		hostname: z.string().nullable(),
		pool: z
			.string()
			.regex(
				/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/,
				"Use letters, digits, dots and dashes",
			)
			.nullable(),
		nodeIds: z.array(z.string()),
		maxReplicasPerNode: wholeNumber(0, 100),
	})
	.refine((value) => value.nodeTarget !== "node" || !!value.hostname, {
		message: "Select a node",
		path: ["hostname"],
	})
	.refine((value) => value.nodeTarget !== "pool" || !!value.pool, {
		message: "Choose a pool",
		path: ["pool"],
	})
	.refine((value) => value.nodeTarget !== "nodes" || value.nodeIds.length > 0, {
		message: "Select at least one node",
		path: ["nodeIds"],
	});

type PlacementForm = z.infer<typeof placementSchema>;

const toForm = (
	placement: Placement,
	nodes: PlacementNode[],
): PlacementForm => ({
	nodeTarget: placement.nodeTarget,
	hostname: placement.hostname,
	pool: placement.pool,
	nodeIds: placement.selectionLabel
		? nodes
				.filter((node) =>
					node.selections.includes(placement.selectionLabel as string),
				)
				.map((node) => node.id)
		: [],
	maxReplicasPerNode: placement.maxReplicasPerNode,
});

const nodeLabel = (node: PlacementNode) =>
	node.name ? `${node.name} (${node.hostname})` : node.hostname;

const nodeDetails = (node: PlacementNode) =>
	[
		node.role,
		node.pool && `pool ${node.pool}`,
		node.availability !== "active" && node.availability,
		node.state !== "ready" && node.state,
	]
		.filter(Boolean)
		.join(" · ");

const listNames = (nodes: PlacementNode[]) =>
	nodes.map((node) => node.name ?? node.hostname).join(", ");

export const PlacementCard = ({
	target,
	placement,
	nodes,
}: {
	target: PlacementTarget;
	placement: Placement;
	nodes: PlacementNode[];
}) => {
	const utils = api.useUtils();
	const applicationPlacement = api.scaling.updatePlacement.useMutation();
	const composePlacement = api.scaling.updateComposePlacement.useMutation();
	const isPending =
		applicationPlacement.isPending || composePlacement.isPending;
	const form = useForm<PlacementForm>({
		defaultValues: toForm(placement, nodes),
		resolver: zodResolver(placementSchema),
	});

	const saved = JSON.stringify(toForm(placement, nodes));
	useEffect(() => {
		form.reset(JSON.parse(saved) as PlacementForm);
	}, [form, saved]);

	const nodeTarget = form.watch("nodeTarget");
	const chosenHostname = form.watch("hostname");
	const chosenPool = form.watch("pool");
	const chosenNodeIds = form.watch("nodeIds");

	const hostnames = nodes.map((node) => node.hostname);
	const savedHostname = placement.hostname;
	const nodeOptions =
		savedHostname && !hostnames.includes(savedHostname)
			? [...nodes, { hostname: savedHostname, name: null } as PlacementNode]
			: nodes;

	const pools = [
		...new Set(
			nodes.map((node) => node.pool).filter((pool): pool is string => !!pool),
		),
	].sort();
	const poolOptions =
		placement.pool && !pools.includes(placement.pool)
			? [...pools, placement.pool]
			: pools;
	const membersOf = (pool: string) =>
		nodes.filter((node) => node.pool === pool);

	const runsOn =
		nodeTarget === "node"
			? nodes.filter((node) => node.hostname === chosenHostname)
			: nodeTarget === "pool" && chosenPool
				? membersOf(chosenPool)
				: nodeTarget === "nodes"
					? nodes.filter((node) => chosenNodeIds.includes(node.id))
					: null;

	const onSubmit = async (values: PlacementForm) => {
		const selection = {
			...values,
			hostname: values.nodeTarget === "node" ? values.hostname : null,
			pool: values.nodeTarget === "pool" ? values.pool : null,
			nodeIds: values.nodeTarget === "nodes" ? values.nodeIds : [],
		};
		const request =
			target.kind === "application"
				? applicationPlacement.mutateAsync({
						applicationId: target.applicationId,
						...selection,
					})
				: composePlacement.mutateAsync({
						composeId: target.composeId,
						serviceName: target.serviceName,
						...selection,
					});
		await request
			.then(() => toast.success("Placement saved"))
			.catch((error) =>
				toast.error(readableErrorMessage(error, "Error saving the placement")),
			);
		if (target.kind === "application") {
			const { applicationId } = target;
			await Promise.all([
				utils.scaling.settings.invalidate({ applicationId }),
				utils.scaling.capacity.invalidate({ applicationId }),
				utils.scaling.events.invalidate({ applicationId }),
				utils.scaling.placementNodes.invalidate({ applicationId }),
				utils.application.one.invalidate({ applicationId }),
			]);
		} else {
			const { composeId } = target;
			await Promise.all([
				utils.scaling.composeStatus.invalidate({ composeId }),
				utils.scaling.composeCapacity.invalidate({ composeId }),
				utils.scaling.composeEvents.invalidate({ composeId }),
				utils.scaling.composePlacementNodes.invalidate({ composeId }),
			]);
		}
	};

	const subject =
		target.kind === "application"
			? "this application's replicas"
			: `the ${target.serviceName} service's replicas`;

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Placement</CardTitle>
				<CardDescription>Which nodes may run {subject}.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					Applies on the next deploy. Replicas only spread across nodes of the
					swarm this {target.kind === "application" ? "application" : "stack"}{" "}
					is deployed to.
				</AlertBlock>
				{placement.usesDefaultManagerPin && (
					<AlertBlock type="info">
						Because the application has mounts, Dokploy runs it on manager nodes
						unless you choose otherwise here. Volumes are local to each node.
					</AlertBlock>
				)}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid gap-4 md:grid-cols-2"
					>
						<FormField
							control={form.control}
							name="nodeTarget"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Run on</FormLabel>
									<Select value={field.value} onValueChange={field.onChange}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="any">Any node</SelectItem>
											<SelectItem value="managers">Manager nodes</SelectItem>
											<SelectItem value="workers">Worker nodes</SelectItem>
											<SelectItem value="pool">A node pool</SelectItem>
											<SelectItem value="node">One specific node</SelectItem>
											<SelectItem value="nodes">Several nodes</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						{nodeTarget === "node" && (
							<FormField
								control={form.control}
								name="hostname"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Node</FormLabel>
										{nodeOptions.length > 0 ? (
											<Select
												value={field.value ?? undefined}
												onValueChange={field.onChange}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select a node" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{nodeOptions.map((node) => (
														<SelectItem
															key={node.hostname}
															value={node.hostname}
														>
															{nodeLabel(node)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										) : (
											<FormControl>
												<Input
													placeholder="Node hostname"
													value={field.value ?? ""}
													onChange={(event) =>
														field.onChange(event.target.value || null)
													}
												/>
											</FormControl>
										)}
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{nodeTarget === "pool" && (
							<FormField
								control={form.control}
								name="pool"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Pool</FormLabel>
										{nodes.length > 0 ? (
											<Select
												value={field.value ?? undefined}
												onValueChange={field.onChange}
												disabled={poolOptions.length === 0}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Choose a pool" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{poolOptions.map((pool) => {
														const members = membersOf(pool);
														return (
															<SelectItem key={pool} value={pool}>
																{pool}:{" "}
																{members.length > 0
																	? listNames(members)
																	: "no nodes"}
															</SelectItem>
														);
													})}
												</SelectContent>
											</Select>
										) : (
											<FormControl>
												<Input
													placeholder="web"
													value={field.value ?? ""}
													onChange={(event) =>
														field.onChange(event.target.value.trim() || null)
													}
												/>
											</FormControl>
										)}
										<FormDescription>
											{nodes.length === 0
												? "Type the pool's name: listing nodes needs permission to read Docker."
												: pools.length > 0
													? "A pool is the name given to nodes with Set pool in Docker → Swarm → Nodes → Multi-VM networking."
													: "No node has a pool yet. Set one on a VM in Docker → Swarm → Nodes → Multi-VM networking, or choose Several nodes."}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{nodeTarget === "nodes" && (
							<FormField
								control={form.control}
								name="nodeIds"
								render={({ field }) => (
									<FormItem className="md:col-span-2">
										<FormLabel>Nodes</FormLabel>
										{nodes.length === 0 ? (
											<AlertBlock type="warning">
												Choosing nodes needs permission to read Docker, to list
												the swarm's nodes.
											</AlertBlock>
										) : (
											<>
												<div className="flex flex-col gap-2 rounded-md border p-3">
													{nodes.map((node) => (
														<div
															key={node.id}
															className="flex items-center gap-3 text-sm"
														>
															<Checkbox
																id={`placement-node-${node.id}`}
																checked={field.value.includes(node.id)}
																onCheckedChange={(checked) =>
																	field.onChange(
																		checked
																			? [...field.value, node.id]
																			: field.value.filter(
																					(id) => id !== node.id,
																				),
																	)
																}
															/>
															<label
																htmlFor={`placement-node-${node.id}`}
																className="flex cursor-pointer flex-wrap items-center gap-x-3"
															>
																<span className="font-medium">
																	{nodeLabel(node)}
																</span>
																<span className="text-xs text-muted-foreground">
																	{nodeDetails(node)}
																</span>
															</label>
														</div>
													))}
												</div>
												{pools.length > 0 && (
													<div className="flex flex-wrap items-center gap-2">
														<span className="text-xs text-muted-foreground">
															Add a pool's nodes:
														</span>
														{pools.map((pool) => (
															<Button
																key={pool}
																type="button"
																variant="outline"
																size="sm"
																onClick={() =>
																	field.onChange([
																		...new Set([
																			...field.value,
																			...membersOf(pool).map((node) => node.id),
																		]),
																	])
																}
															>
																{pool}
															</Button>
														))}
													</div>
												)}
											</>
										)}
										<FormDescription>
											Dokploy labels exactly these nodes for this service. A
											node added later is not included until you select it.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<FormField
							control={form.control}
							name="maxReplicasPerNode"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Max replicas per node</FormLabel>
									<FormControl>
										<Input
											type="number"
											inputMode="numeric"
											{...field}
											onChange={(event) =>
												field.onChange(event.target.valueAsNumber)
											}
											value={Number.isNaN(field.value) ? "" : field.value}
										/>
									</FormControl>
									<FormDescription>
										Swarm already puts each new replica on the eligible node
										running the fewest of them. 0 means no limit; 1 keeps a node
										failure from taking down more than one replica.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						{runsOn && nodes.length > 0 && (
							<p className="text-sm md:col-span-2">
								<span className="font-medium">Replicas will run on: </span>
								{runsOn.length > 0 ? (
									listNames(runsOn)
								) : (
									<span className="text-red-600 dark:text-red-400">
										no node. The replicas would stay pending.
									</span>
								)}
							</p>
						)}
						{placement.otherConstraints.length > 0 && (
							<div className="flex flex-col gap-1 md:col-span-2">
								<span className="text-sm font-medium">
									Other constraints (kept as they are)
								</span>
								<ul className="flex flex-col gap-1">
									{placement.otherConstraints.map((constraint) => (
										<li
											key={constraint}
											className="font-mono text-xs text-muted-foreground"
										>
											{constraint}
										</li>
									))}
								</ul>
								<span className="text-xs text-muted-foreground">
									{target.kind === "application"
										? "Edit these in Advanced → Cluster Settings → Swarm Settings."
										: "Edit these in the compose file (deploy.placement.constraints)."}
								</span>
							</div>
						)}
						<div className="flex justify-end md:col-span-2">
							<Button type="submit" isLoading={isPending}>
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
