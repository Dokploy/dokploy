import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { LoaderIcon } from "lucide-react";
import { ServerOverviewCard } from "./server-card";

export default function ServersOverview() {
	const { data: servers, isLoading } = api.server.all.useQuery();

	if (isLoading) {
		return (
			<>
				<Card className="w-full bg-transparent">
					<CardHeader>
						<CardTitle className="flex items-center justify-between">
							<span className="flex items-center gap-2">
								<LoaderIcon />
							</span>
							<Badge className="text-xs">
								<LoaderIcon />
							</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid gap-2 text-sm">
							<div className="flex justify-between">
								<span className="font-medium">IP Address:</span>
							</div>
							<div className="flex justify-between">
								<span className="font-medium">Port:</span>
							</div>
							<div className="flex justify-between">
								<span className="font-medium">Username:</span>
							</div>
							<div className="flex justify-between">
								<span className="font-medium">App Name:</span>
							</div>
							<div className="flex justify-between">
								<span className="font-medium">Docker Cleanup:</span>
							</div>
							<div className="flex justify-between">
								<span className="font-medium">Created At:</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</>
		);
	}

	if (!servers) {
		return <div>No servers found</div>;
	}
	return (
		<div className="w-full max-w-7xl mx-auto">
			<div className="flex justify-between items-center mb-4">
				<h1 className="text-2xl font-bold">Server Overview</h1>
				<Button
					type="button"
					onClick={() => window.location.replace("/dashboard/settings/servers")}
				>
					Manage Servers
				</Button>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{servers.map((server) => (
					<ServerOverviewCard server={server} key={server.serverId} />
				))}
			</div>
		</div>
	);
}
