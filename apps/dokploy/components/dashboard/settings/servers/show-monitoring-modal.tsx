import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ShowMonitoring } from "../../monitoring/show-monitoring";

interface Props {
	url: string;
}

export const ShowMonitoringModal = ({ url }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Show Monitoring
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-7xl  overflow-y-auto max-h-screen ">
				<div className="flex gap-4 py-4 w-full">
					<ShowMonitoring BASE_URL={url} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
