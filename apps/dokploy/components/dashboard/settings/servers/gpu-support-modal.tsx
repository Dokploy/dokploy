import { useState } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					<span>{t("settings.servers.gpuSetup.menuItem")}</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{t("settings.servers.gpuSetup.title")}
					</DialogTitle>
				</DialogHeader>

				<GPUSupport serverId="" />
			</DialogContent>
		</Dialog>
	);
};
