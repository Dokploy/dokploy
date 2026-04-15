import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";

interface Props {
	containerId: string;
	serverId?: string;
}

interface Network {
	IPAMConfig: unknown;
	Links: unknown;
	Aliases: string[] | null;
	MacAddress: string;
	NetworkID: string;
	EndpointID: string;
	Gateway: string;
	IPAddress: string;
	IPPrefixLen: number;
	IPv6Gateway: string;
	GlobalIPv6Address: string;
	GlobalIPv6PrefixLen: number;
	DriverOpts: unknown;
}

export const ShowContainerNetworks = ({ containerId, serverId }: Props) => {
	const { data } = api.docker.getConfig.useQuery(
		{
			containerId,
			serverId,
		},
		{
			enabled: !!containerId,
		},
	);

	const networks: Record<string, Network> =
		data?.NetworkSettings?.Networks ?? {};
	const entries = Object.entries(networks);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					View Networks
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="w-full md:w-[70vw] min-w-[70vw]">
				<DialogHeader>
					<DialogTitle>Container Networks</DialogTitle>
					<DialogDescription>
						Networks attached to this container
					</DialogDescription>
				</DialogHeader>
				<div className="overflow-auto max-h-[70vh]">
					{entries.length === 0 ? (
						<div className="text-center text-muted-foreground py-8">
							No networks found for this container.
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Network</TableHead>
									<TableHead>IP Address</TableHead>
									<TableHead>Gateway</TableHead>
									<TableHead>MAC Address</TableHead>
									<TableHead>Aliases</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{entries.map(([name, network]) => (
									<TableRow key={name}>
										<TableCell>
											<Badge variant="outline">{name}</Badge>
										</TableCell>
										<TableCell className="font-mono text-xs">
											{network.IPAddress
												? `${network.IPAddress}/${network.IPPrefixLen}`
												: "-"}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{network.Gateway || "-"}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{network.MacAddress || "-"}
										</TableCell>
										<TableCell className="text-xs">
											{network.Aliases?.join(", ") || "-"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
