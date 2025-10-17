import { Info, Network, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/utils/api";

interface Props {
	resourceId: string;
	resourceType:
		| "application"
		| "compose"
		| "postgres"
		| "mysql"
		| "mariadb"
		| "mongo"
		| "redis";
	composeType?: "docker-compose" | "stack";
	showCard?: boolean;
}

const getResourceTypeName = (type: Props["resourceType"]): string => {
	const names: Record<Props["resourceType"], string> = {
		application: "application",
		compose: "compose service",
		postgres: "database",
		mysql: "database",
		mariadb: "database",
		mongo: "database",
		redis: "database",
	};
	return names[type];
};

const isSwarmResource = (
	type: Props["resourceType"],
	composeType?: Props["composeType"],
): boolean => {
	if (type === "compose") {
		return composeType === "stack";
	}
	return true;
};

export const AssignNetworkToResource = ({
	resourceId,
	resourceType,
	composeType,
	showCard = false,
}: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { data: availableNetworks } = api.network.allForResource.useQuery({
		resourceType,
		resourceId,
		composeType,
	});

	const { data: assignedNetworks } = api.network.getResourceNetworks.useQuery({
		resourceId,
		resourceType,
	});

	const { data: resourceDomains } =
		resourceType === "application"
			? api.domain.byApplicationId.useQuery({ applicationId: resourceId })
			: resourceType === "compose"
				? api.domain.byComposeId.useQuery({ composeId: resourceId })
				: { data: [] };

	const hasDomains = resourceDomains && resourceDomains.length > 0;

	const { mutateAsync: assignNetwork, isLoading: isAssigning } =
		api.network.assignToResource.useMutation();

	const { mutateAsync: removeNetwork, isLoading: isRemoving } =
		api.network.removeFromResource.useMutation();

	const assignedNetworkIds = assignedNetworks?.map((n) => n.networkId) || [];

	const availableToAssign = availableNetworks?.filter(
		(network) => !assignedNetworkIds.includes(network.networkId),
	);

	const wouldBeAllInternal = (networkIdToAssign: string): boolean => {
		const currentAssignedNetworks = assignedNetworks || [];
		const networkToAssign = availableNetworks?.find(
			(n) => n.networkId === networkIdToAssign,
		);

		if (!networkToAssign) return false;

		const allNetworksAfterAssign = [
			...currentAssignedNetworks,
			networkToAssign,
		];

		return allNetworksAfterAssign.every((n) => n.internal);
	};

	const handleAssign = async (networkId: string) => {
		try {
			await assignNetwork({
				networkId,
				resourceId,
				resourceType,
			});

			toast.success("Network assigned successfully");
			await utils.network.getResourceNetworks.invalidate({
				resourceId,
				resourceType,
			});
			setOpen(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to assign network";
			toast.error(message);
		}
	};

	const handleRemove = async (networkId: string) => {
		try {
			await removeNetwork({
				networkId,
				resourceId,
				resourceType,
			});

			toast.success("Network removed successfully");
			await utils.network.getResourceNetworks.invalidate({
				resourceId,
				resourceType,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to remove network";
			toast.error(message);
		}
	};

	const resourceTypeName = getResourceTypeName(resourceType);
	const isSwarm = isSwarmResource(resourceType, composeType);
	const isDatabaseType = [
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
	].includes(resourceType);

	const content = (
		<div className="space-y-4">
			{isSwarm && (
				<Alert>
					<Info className="h-4 w-4" />
					<AlertDescription>
						{isDatabaseType ? "Databases" : "Applications"} are deployed as
						Docker Swarm services and can only use <strong>overlay</strong>{" "}
						networks. Only overlay networks are shown below.
					</AlertDescription>
				</Alert>
			)}

			{resourceType === "compose" && composeType === "docker-compose" && (
				<Alert>
					<Info className="h-4 w-4" />
					<AlertDescription>
						This compose service uses <strong>docker-compose</strong> mode and
						can use both <strong>bridge</strong> and <strong>overlay</strong>{" "}
						networks.
					</AlertDescription>
				</Alert>
			)}

			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium">Custom Networks</h3>
					<p className="text-sm text-muted-foreground">
						Assign this {resourceTypeName} to custom networks for isolation
					</p>
				</div>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button size="sm" disabled={!availableToAssign?.length}>
							<Plus className="mr-2 h-4 w-4" />
							Assign Network
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[300px] p-0" align="end">
						<Command>
							<CommandInput placeholder="Search networks..." />
							<CommandEmpty>No networks found.</CommandEmpty>
							<CommandGroup>
								<ScrollArea className="h-[200px]">
									{availableToAssign?.map((network) => {
										const showWarning =
											hasDomains && wouldBeAllInternal(network.networkId);

										return (
											<CommandItem
												key={network.networkId}
												value={network.name}
												onSelect={() => handleAssign(network.networkId)}
												className="cursor-pointer"
											>
												<Network className="mr-2 h-4 w-4" />
												<div className="flex-1">
													<div className="font-medium">{network.name}</div>
													<div className="text-xs text-muted-foreground">
														{network.networkName} • {network.driver}
														{network.internal && " (internal)"}
														{network.server && ` • ${network.server.name}`}
													</div>
													{showWarning && (
														<div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
															Warning: This will make all networks internal.
															Domains will be inaccessible.
														</div>
													)}
												</div>
											</CommandItem>
										);
									})}
								</ScrollArea>
							</CommandGroup>
						</Command>
					</PopoverContent>
				</Popover>
			</div>

			{hasDomains &&
				assignedNetworks &&
				assignedNetworks.length > 0 &&
				assignedNetworks.every((n) => n.internal) && (
					<Alert variant="destructive">
						<Info className="h-4 w-4" />
						<AlertDescription>
							This {resourceTypeName} has {resourceDomains?.length || 0}{" "}
							domain(s) but all assigned networks are internal. Domains will not
							be accessible because Traefik cannot connect to internal networks.
							Assign at least one non-internal network to make domains
							accessible.
						</AlertDescription>
					</Alert>
				)}

			{assignedNetworks && assignedNetworks.length > 0 ? (
				<>
					<div className="flex flex-wrap gap-2">
						{assignedNetworks.map((network) => (
							<Badge
								key={network.networkId}
								variant="secondary"
								className="group flex items-center gap-2 pr-1"
							>
								<Network className="h-3 w-3" />
								<span>{network.name}</span>
								<button
									type="button"
									onClick={() => handleRemove(network.networkId)}
									disabled={isRemoving}
									className="ml-1 rounded-sm opacity-70 transition-opacity hover:opacity-100 disabled:opacity-50"
								>
									<X className="h-3 w-3" />
								</button>
							</Badge>
						))}
					</div>
					{isDatabaseType ? (
						<div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3">
							<p className="text-sm text-blue-900 dark:text-blue-100">
								<strong>Network Isolation Active:</strong> This database is
								disconnected from{" "}
								<code className="relative rounded bg-blue-100 dark:bg-blue-900 px-[0.3rem] py-[0.2rem] font-mono text-xs">
									dokploy-network
								</code>{" "}
								and only accessible through the custom networks assigned above.
							</p>
							<p className="text-xs text-blue-800 dark:text-blue-200 mt-2">
								This enhances security by limiting connectivity to explicitly
								allowed networks only.
							</p>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							This {resourceTypeName} will not be connected to{" "}
							<code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs">
								dokploy-network
							</code>{" "}
							and will only use the networks assigned above.
						</p>
					)}
				</>
			) : (
				<div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
					<Network className="h-4 w-4" />
					<span>
						No custom networks assigned. This {resourceTypeName} will use the
						default dokploy-network.
					</span>
				</div>
			)}

			{!availableNetworks || availableNetworks.length === 0 ? (
				<div className="rounded-lg border border-dashed p-4">
					<p className="text-sm text-muted-foreground">
						No custom networks available. Create a network first.
					</p>
				</div>
			) : null}
		</div>
	);

	if (showCard) {
		return (
			<Card className="bg-background">
				<CardHeader>
					<CardTitle>Network Configuration</CardTitle>
					<CardDescription>
						Manage network connectivity for this {resourceTypeName}
					</CardDescription>
				</CardHeader>
				<CardContent>{content}</CardContent>
			</Card>
		);
	}

	return content;
};
