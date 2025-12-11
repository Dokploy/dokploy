import { useState } from "react";
import { useTranslation } from "next-i18next";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ShowContainers } from "../../docker/show/show-containers";

interface Props {
	serverId: string;
}

export const ShowDockerContainersModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { t } = useTranslation("common");

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					{t("dashboard.containers")}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-7xl  ">
				<div className="grid w-full gap-1">
					<ShowContainers serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
