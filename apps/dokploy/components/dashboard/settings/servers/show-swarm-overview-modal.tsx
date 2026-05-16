import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShowSwarmContainers } from "../../swarm/containers/show-swarm-containers";
import SwarmMonitorCard from "../../swarm/monitoring-card";

interface Props {
	serverId: string;
}

export const ShowSwarmOverviewModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Show Swarm Overview
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-7xl  ">
				<Tabs defaultValue="overview">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="containers">Containers</TabsTrigger>
					</TabsList>
					<TabsContent value="overview">
						<div className="grid w-full gap-1">
							<SwarmMonitorCard serverId={serverId} />
						</div>
					</TabsContent>
					<TabsContent value="containers">
						<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
							<div className="rounded-xl bg-background shadow-md p-6">
								<ShowSwarmContainers serverId={serverId} />
							</div>
						</Card>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
};
