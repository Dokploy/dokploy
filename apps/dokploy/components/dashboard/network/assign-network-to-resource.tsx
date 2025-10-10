import { Network, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

export const AssignNetworkToResource = ({
	resourceId,
	resourceType,
	composeType,
}: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { data: availableNetworks } = api.network.allForResource.useQuery({
		resourceType,
		composeType,
	});

	const { data: assignedNetworks } = api.network.getResourceNetworks.useQuery({
		resourceId,
		resourceType,
	});

	const { mutateAsync: assignNetwork, isLoading: isAssigning } =
		api.network.assignToResource.useMutation();

	const { mutateAsync: removeNetwork, isLoading: isRemoving } =
		api.network.removeFromResource.useMutation();

	const assignedNetworkIds = assignedNetworks?.map((n) => n.networkId) || [];

	const availableToAssign = availableNetworks?.filter(
		(network) => !assignedNetworkIds.includes(network.networkId),
	);

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

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium">Custom Networks</h3>
					<p className="text-sm text-muted-foreground">
						Assign this service to custom networks for isolation
					</p>
				</div>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							disabled={!availableToAssign?.length}
						>
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
									{availableToAssign?.map((network) => (
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
												</div>
											</div>
											{network.isDefault && (
												<Badge variant="secondary" className="ml-2">
													Default
												</Badge>
											)}
										</CommandItem>
									))}
								</ScrollArea>
							</CommandGroup>
						</Command>
					</PopoverContent>
				</Popover>
			</div>

			{assignedNetworks && assignedNetworks.length > 0 ? (
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
			) : (
				<div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
					<Network className="h-4 w-4" />
					<span>
						No custom networks assigned. This service will use the default
						dokploy-network.
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
};
