import { Activity, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
	serverId: string | null;
	serverName: string;
}

export const MonitoringEmptyState = ({ serverId, serverName }: Props) => {
	const href =
		serverId === null
			? "/dashboard/settings/server"
			: "/dashboard/settings/servers";

	return (
		<div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center">
			<div className="rounded-full bg-muted p-3">
				<Activity className="h-6 w-6 text-muted-foreground" />
			</div>
			<div className="space-y-1">
				<h3 className="text-base font-semibold">
					Monitoring isn't set up on {serverName} yet
				</h3>
				<p className="max-w-md text-sm text-muted-foreground">
					Install the Dokploy monitoring agent to collect CPU, memory, disk,
					network, and per-deployment metrics for this server.
				</p>
			</div>
			<Button asChild>
				<Link href={href}>
					Configure monitoring
					<ArrowRight className="ml-2 h-4 w-4" />
				</Link>
			</Button>
		</div>
	);
};
