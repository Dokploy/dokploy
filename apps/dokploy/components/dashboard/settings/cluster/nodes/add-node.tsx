import { ExternalLink, PlusIcon } from "lucide-react";
import Link from "next/link";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddManager } from "./manager/add-manager";
import { AddWorker } from "./workers/add-worker";

interface Props {
	serverId?: string;
}

export const AddNode = ({ serverId }: Props) => {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button className="w-full cursor-pointer space-x-3">
					<PlusIcon className="h-4 w-4" />
					Add Node
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Add Node</DialogTitle>
					<DialogDescription className="flex flex-col gap-2">
						Follow the steps to add a new node to your cluster, before you start
						using this feature, you need to understand how docker swarm works.{" "}
						<Link
							href="https://docs.docker.com/engine/swarm/"
							target="_blank"
							className="text-primary flex flex-row gap-2 items-center"
						>
							Docker Swarm
							<ExternalLink className="h-4 w-4" />
						</Link>
						<Link
							href="https://docs.docker.com/engine/swarm/how-swarm-mode-works/nodes/"
							target="_blank"
							className="text-primary flex flex-row gap-2 items-center"
						>
							Architecture
							<ExternalLink className="h-4 w-4" />
						</Link>
						<AlertBlock type="warning">
							Make sure you use the same architecture as the node you are
							adding.
						</AlertBlock>
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Tabs defaultValue="worker">
						<TabsList>
							<TabsTrigger value="worker">Worker</TabsTrigger>
							<TabsTrigger value="manager">Manager</TabsTrigger>
						</TabsList>
						<TabsContent value="worker" className="pt-4 overflow-hidden">
							<AddWorker serverId={serverId} />
						</TabsContent>
						<TabsContent value="manager" className="pt-4 overflow-hidden">
							<AddManager serverId={serverId} />
						</TabsContent>
					</Tabs>
				</div>
			</DialogContent>
		</Dialog>
	);
};
