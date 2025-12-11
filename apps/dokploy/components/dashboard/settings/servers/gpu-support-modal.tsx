import { useState } from "react";
import { useTranslation } from "next-i18next";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { GPUSupport } from "./gpu-support";

export const GPUSupportModal = () => {
	const [isOpen, setIsOpen] = useState(false);
	const { t } = useTranslation("settings");

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					<span>{t("settings.servers.gpu.modal.menuItem")}</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.servers.gpu.modal.title")}
					</DialogTitle>
				</DialogHeader>

				<GPUSupport serverId="" />
			</DialogContent>
		</Dialog>
	);
};
