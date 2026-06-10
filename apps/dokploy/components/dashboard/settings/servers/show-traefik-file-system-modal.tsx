import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { ShowTraefikSystem } from "../../file-system/show-traefik-system";

interface Props {
	serverId: string;
}

export const ShowTraefikFileSystemModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data: activeProvider } =
		api.settings.getActiveWebServerProvider.useQuery({
			serverId,
		});
	const providerLabel =
		activeProvider === "caddy"
			? "Caddy"
			: activeProvider === "traefik"
				? "Traefik"
				: "Web Server";

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Show {providerLabel} File System
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-7xl  ">
				<ShowTraefikSystem
					serverId={serverId}
					activeProvider={activeProvider}
				/>
			</DialogContent>
		</Dialog>
	);
};
