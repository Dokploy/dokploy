import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ShowStorageActions } from "./show-storage-actions";
import { ShowTraefikActions } from "./show-traefik-actions";
import { ToggleDockerCleanup } from "./toggle-docker-cleanup";
interface Props {
	serverId: string;
}

export const ShowServerActions = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					View Actions
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-xl">
				<div className="flex flex-col gap-1">
					<DialogTitle className="text-xl">Web server settings</DialogTitle>
					<DialogDescription>Reload or clean the web server.</DialogDescription>
				</div>

				<div className="grid w-full grid-cols-2 gap-4">
					<ShowTraefikActions serverId={serverId} />
					<ShowStorageActions serverId={serverId} />
					<ToggleDockerCleanup serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
