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
import { ShowContainers } from "../../docker/show/show-containers";

interface Props {
	serverId: string;
}

export const ShowDockerContainersModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Show Docker Containers
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-7xl  overflow-y-auto max-h-screen ">
				<DialogHeader>
					<div className="flex flex-col gap-1.5">
						<DialogTitle className="flex items-center gap-2">
							<ContainerIcon className="size-5" /> Docker Containers
						</DialogTitle>
						<p className="text-muted-foreground text-sm">
							See all the containers of your remote server
						</p>
					</div>
				</DialogHeader>

				<div className="grid w-full gap-1">
					<ShowContainers serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
