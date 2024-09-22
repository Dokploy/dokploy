import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FileTextIcon } from "lucide-react";
import { useState } from "react";
import { ShowTraefikSystem } from "../../file-system/show-traefik-system";

interface Props {
	serverId: string;
}

export const ShowTraefikFileSystemModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Show Traefik File System
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-7xl  overflow-y-auto max-h-screen ">
				<DialogHeader>
					<div className="flex flex-col gap-1.5">
						<DialogTitle className="flex items-center gap-2">
							<FileTextIcon className="size-5" /> Traefik File System
						</DialogTitle>
						<p className="text-muted-foreground text-sm">
							See all the files and directories of your traefik configuration
						</p>
					</div>
				</DialogHeader>

				<div id="hook-form-add-gitlab" className="grid w-full gap-1">
					<ShowTraefikSystem serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
