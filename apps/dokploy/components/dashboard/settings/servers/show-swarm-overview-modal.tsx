import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ContainerIcon } from "lucide-react";
import { useState } from "react";
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
			<DialogContent className="sm:max-w-7xl  overflow-y-auto max-h-screen ">
				<DialogHeader>
					<div className="flex flex-col gap-1.5">
						<DialogTitle className="flex items-center gap-2">
							<ContainerIcon className="size-5" />
							Swarm Overview
						</DialogTitle>
						<p className="text-muted-foreground text-sm">
							See all details of your swarm node
						</p>
					</div>
				</DialogHeader>
				<div className="grid w-full gap-1">
					<SwarmMonitorCard serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
