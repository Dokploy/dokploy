import {
	AlertTriangle,
	Globe,
	Lock,
	Network,
	Server,
	Settings,
} from "lucide-react";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { DeleteNetwork } from "./delete-network";
import { UpdateNetwork } from "./update-network";

export const NetworkList = () => {
	const { data: networks, isLoading } = api.network.all.useQuery();

	if (isLoading) {
		return (
			<div className="flex h-32 items-center justify-center">
				<div className="text-sm text-muted-foreground">Loading networks...</div>
			</div>
		);
	}

	if (!networks || networks.length === 0) {
		return (
			<Card className="bg-background">
				<CardHeader>
					<CardTitle>No Networks</CardTitle>
					<CardDescription>
						Create a custom network to isolate your services
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col items-center justify-center space-y-4 py-8">
						<Network className="h-16 w-16 text-muted-foreground" />
						<p className="text-center text-sm text-muted-foreground">
							Custom networks allow you to control which services can
							communicate with each other
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{networks.map((network) => (
				<Card key={network.networkId} className="relative bg-background">
					<CardHeader className="pb-3">
						<div className="flex items-start justify-between">
							<div className="flex items-center gap-2">
								<Network className="h-4 w-4 text-muted-foreground" />
								<CardTitle className="text-base">{network.name}</CardTitle>
							</div>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="h-8 w-8">
										<Settings className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuLabel>Actions</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<UpdateNetwork network={network} />
									<DeleteNetwork networkId={network.networkId} />
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="space-y-1">
							<div className="flex items-center gap-2 text-sm">
								<Server className="h-3 w-3 text-muted-foreground" />
								<code className="rounded bg-muted px-1.5 py-0.5 text-xs">
									{network.networkName}
								</code>
							</div>

							{network.description && (
								<p className="text-sm text-muted-foreground line-clamp-2">
									{network.description}
								</p>
							)}
						</div>

						<div className="flex flex-wrap gap-2">
							<Badge variant="outline" className="text-xs">
								{network.driver}
							</Badge>

							{network.internal && (
								<Badge variant="outline" className="text-xs">
									<AlertTriangle className="mr-1 h-3 w-3" />
									Internal
								</Badge>
							)}

							{!network.internal && (
								<Badge variant="outline" className="text-xs">
									<Globe className="mr-1 h-3 w-3" />
									External
								</Badge>
							)}

							{network.encrypted && network.driver === "overlay" && (
								<Badge variant="outline" className="text-xs">
									<Lock className="mr-1 h-3 w-3" />
									Encrypted
								</Badge>
							)}
						</div>

						{network.subnet && (
							<div className="pt-2 text-xs text-muted-foreground">
								<div className="flex items-center gap-1">
									<span className="font-medium">Subnet:</span>
									<code className="rounded bg-muted px-1 py-0.5">
										{network.subnet}
									</code>
								</div>
								{network.gateway && (
									<div className="flex items-center gap-1">
										<span className="font-medium">Gateway:</span>
										<code className="rounded bg-muted px-1 py-0.5">
											{network.gateway}
										</code>
									</div>
								)}
							</div>
						)}

						<div className="pt-2 text-xs text-muted-foreground">
							Created {new Date(network.createdAt).toLocaleDateString()}
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
};
