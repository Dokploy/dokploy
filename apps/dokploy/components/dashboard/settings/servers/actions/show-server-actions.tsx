import { useState } from "react";
import { useTranslation } from "react-i18next";
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
	children?: React.ReactNode;
}

export const ShowServerActions = ({ serverId, children }: Props) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			{children ? (
				<DialogTrigger asChild>{children}</DialogTrigger>
			) : (
				<DialogTrigger asChild>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						onSelect={(e) => {
							e.preventDefault();
						}}
					>
						{t("settings.servers.serverActions.viewActions")}
					</DropdownMenuItem>
				</DialogTrigger>
			)}
			<DialogContent
				className="sm:max-w-xl"
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				<div className="flex flex-col gap-1">
					<DialogTitle className="text-xl">
						{t("settings.servers.serverActions.title")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.servers.serverActions.description")}
					</DialogDescription>
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
