import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { ShowNodes } from "./show-nodes";

interface Props {
	serverId: string;
}

export const ShowNodesModal = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					{t("settings.nodes.showSwarmNodes")}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="min-w-[70vw]">
				<div className="grid w-full gap-1">
					<ShowNodes serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
