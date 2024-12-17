import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import {
	AlertCircle,
	CheckCircle,
	HelpCircle,
	Layers,
	LoaderIcon,
	Settings,
} from "lucide-react";
import { useState } from "react";
import ShowNodeApplications from "../applications/show-applications";
import { ShowNodeConfig } from "../details/show-node";

export interface SwarmList {
	ID: string;
	Hostname: string;
	Availability: string;
	EngineVersion: string;
	Status: string;
	ManagerStatus: string;
	TLSStatus: string;
}

interface NodeCardProps {
	node: SwarmList;
}

export function NodeCard({ node }: NodeCardProps) {
	const [showConfig, setShowConfig] = useState(false);
	const [showServices, setShowServices] = useState(false);

	const { data, isLoading } = api.swarm.getNodeInfo.useQuery({
		nodeId: node.ID,
	});

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "Ready":
				return <CheckCircle className="h-4 w-4 text-green-500" />;
			case "Down":
				return <AlertCircle className="h-4 w-4 text-red-500" />;
			default:
				return <HelpCircle className="h-4 w-4 text-yellow-500" />;
		}
	};

	if (isLoading) {
		return (
			<Card className="w-full">
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span className="flex items-center gap-2">
							{getStatusIcon(node.Status)}
							{node.Hostname}
						</span>
						<Badge variant="outline" className="text-xs">
							{node.ManagerStatus || "Worker"}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center">
						<LoaderIcon className="h-6 w-6 animate-spin" />
					</div>
				</CardContent>
			</Card>
		);
	}

	console.log(data);
	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span className="flex items-center gap-2">
						{getStatusIcon(node.Status)}
						{node.Hostname}
					</span>
					<Badge variant="outline" className="text-xs">
						{node.ManagerStatus || "Worker"}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-2 text-sm">
					<div className="flex justify-between">
						<span className="font-medium">Status:</span>
						<span>{node.Status}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-medium">IP Address:</span>
						{isLoading ? (
							<LoaderIcon className="animate-spin" />
						) : (
							<span>{data.Status.Addr}</span>
						)}
					</div>
					<div className="flex justify-between">
						<span className="font-medium">Availability:</span>
						<span>{node.Availability}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-medium">Engine Version:</span>
						<span>{node.EngineVersion}</span>
					</div>
					<div className="flex justify-between">
						<span className="font-medium">CPU:</span>
						{isLoading ? (
							<LoaderIcon className="animate-spin" />
						) : (
							<span>
								{(data.Description.Resources.NanoCPUs / 1e9).toFixed(2)} GHz
							</span>
						)}
					</div>
					<div className="flex justify-between">
						<span className="font-medium">Memory:</span>
						{isLoading ? (
							<LoaderIcon className="animate-spin" />
						) : (
							<span>
								{(data.Description.Resources.MemoryBytes / 1024 ** 3).toFixed(
									2,
								)}{" "}
								GB
							</span>
						)}
					</div>
					<div className="flex justify-between">
						<span className="font-medium">TLS Status:</span>
						<span>{node.TLSStatus}</span>
					</div>
				</div>
				<div className="flex gap-2 mt-4">
					<ShowNodeConfig nodeId={node.ID} />
					{/* <Dialog open={showConfig} onOpenChange={setShowConfig}>
						<DialogTrigger asChild>
							<Button variant="outline" size="sm" className="w-full">
								<Settings className="h-4 w-4 mr-2" />
								Config
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Node Configuration</DialogTitle>
							</DialogHeader>
							<div className="mt-4">
								<pre className="bg-gray-100 p-4 rounded-md overflow-auto">
									{JSON.stringify(node, null, 2)}
								</pre>
							</div>
						</DialogContent>
					</Dialog> */}
					<ShowNodeApplications nodeName="node.Hostname" />
					{/* <Dialog open={showServices} onOpenChange={setShowServices}>
						<DialogTrigger asChild>
							<Button variant="outline" size="sm" className="w-full">
								<Layers className="h-4 w-4 mr-2" />
								Services
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Node Services</DialogTitle>
							</DialogHeader>
							<div className="mt-4">
								<p>Service information would be displayed here.</p>
							</div>
						</DialogContent>
					</Dialog> */}
				</div>
			</CardContent>
		</Card>
	);
}
