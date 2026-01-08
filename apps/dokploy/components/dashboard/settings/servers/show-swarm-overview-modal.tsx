import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
				<div className="grid w-full gap-1">
					<SwarmMonitorCard serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
