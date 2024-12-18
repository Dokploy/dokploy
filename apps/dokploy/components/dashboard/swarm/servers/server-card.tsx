import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle, HelpCircle, ServerIcon } from "lucide-react";
import { ShowContainers } from "../../docker/show/show-containers";

export interface Server {
	serverId: string;
	name: string;
	description: string | null;
	ipAddress: string;
	port: number;
	username: string;
	appName: string;
	enableDockerCleanup: boolean;
	createdAt: string;
	adminId: string;
	serverStatus: "active" | "inactive";
	command: string;
	sshKeyId: string | null;
}

interface ServerOverviewCardProps {
	server: Server;
}

export function ServerOverviewCard({ server }: ServerOverviewCardProps) {
	const getStatusIcon = (status: string) => {
		switch (status) {
			case "active":
				return <CheckCircle className="h-4 w-4 text-green-500" />;
			case "inactive":
				return <AlertCircle className="h-4 w-4 text-red-500" />;
			default:
				return <HelpCircle className="h-4 w-4 text-yellow-500" />;
		}
	};

	return (
		<Card className="w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span className="flex items-center gap-2">
						{getStatusIcon(server.serverStatus)}
						{server.name}
					</span>
					<Badge
						variant={
							server.serverStatus === "active" ? "default" : "destructive"
						}
						className="text-xs"
					>
						{server.serverStatus}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-2 text-sm">
					<div className="flex justify-between">
						<span className="font-medium">IP Address:</span>
						<span>{server.ipAddress}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-medium">Port:</span>
						<span>{server.port}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-medium">Username:</span>
						<span>{server.username}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-medium">App Name:</span>
						<span>{server.appName}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-medium">Docker Cleanup:</span>
						<span>{server.enableDockerCleanup ? "Enabled" : "Disabled"}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-medium">Created At:</span>
						<span>{new Date(server.createdAt).toLocaleString()}</span>
					</div>
				</div>
				<div className="mt-4">
					<Dialog>
						<DialogTrigger asChild>
							<Button variant="outline" size="sm" className="w-full">
								<ServerIcon className="h-4 w-4 mr-2" />
								Show Containers
							</Button>
						</DialogTrigger>
						<DialogContent
							className={"sm:max-w-5xl overflow-y-auto max-h-screen"}
						>
							<ShowContainers serverId={server.serverId} />
						</DialogContent>
					</Dialog>
				</div>
			</CardContent>
		</Card>
	);
}
