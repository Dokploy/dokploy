import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ShowNodes } from "./show-nodes";

interface Props {
	serverId: string;
}

export const ShowNodesModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Show Swarm Nodes
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-5xl  overflow-y-auto max-h-screen ">
				<div className="grid w-full gap-1">
					<ShowNodes serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
