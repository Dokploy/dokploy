import { Network } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CreateNetwork } from "../network/create-network";
import { NetworkList } from "../network/network-list";

interface Props {
	projectId?: string;
	serverId?: string | null;
}

export const NetworksTab = ({ projectId, serverId }: Props) => {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Custom Networks</CardTitle>
							<CardDescription>
								Manage Docker networks for service isolation and communication
								control
							</CardDescription>
						</div>
						<CreateNetwork projectId={projectId} serverId={serverId} />
					</div>
				</CardHeader>
				<CardContent>
					<NetworkList />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Network Isolation Benefits</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex items-start gap-3">
						<Network className="mt-0.5 h-5 w-5 text-muted-foreground" />
						<div>
							<div className="font-medium">Security Isolation</div>
							<p className="text-sm text-muted-foreground">
								Services can only communicate if they're on the same network,
								preventing unauthorized access
							</p>
						</div>
					</div>
					<div className="flex items-start gap-3">
						<Network className="mt-0.5 h-5 w-5 text-muted-foreground" />
						<div>
							<div className="font-medium">Multi-Tenancy</div>
							<p className="text-sm text-muted-foreground">
								Isolate different projects or clients on separate networks
							</p>
						</div>
					</div>
					<div className="flex items-start gap-3">
						<Network className="mt-0.5 h-5 w-5 text-muted-foreground" />
						<div>
							<div className="font-medium">Traefik Integration</div>
							<p className="text-sm text-muted-foreground">
								Traefik automatically connects to your networks to route traffic
								without exposing services globally
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};
