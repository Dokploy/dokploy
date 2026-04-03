import { Activity } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ShowStorageActions } from "./show-storage-actions";
import { ShowTraefikActions } from "./show-traefik-actions";
import { ToggleDockerCleanup } from "./toggle-docker-cleanup";

interface Props {
	serverId: string;
	asButton?: boolean;
}

export const ShowServerActions = ({ serverId, asButton = false }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			{asButton ? (
				<DialogTrigger asChild>
					<Button variant="outline" size="icon" className="h-9 w-9">
						<Activity className="h-4 w-4" />
					</Button>
				</DialogTrigger>
			) : (
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => {
						e.preventDefault();
						setIsOpen(true);
					}}
				>
					View Actions
				</DropdownMenuItem>
			)}
			<DialogContent className="sm:max-w-xl">
				<div className="flex flex-col gap-1">
					<DialogTitle className="text-xl">Web server settings</DialogTitle>
					<DialogDescription>Reload or clean the web server.</DialogDescription>
				</div>

				<div className="grid grid-cols-2 w-full gap-4">
					<ShowTraefikActions serverId={serverId} />
					<ShowStorageActions serverId={serverId} />
					<ToggleDockerCleanup serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
