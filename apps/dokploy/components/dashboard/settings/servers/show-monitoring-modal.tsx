import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ShowPaidMonitoring } from "../../monitoring/paid/servers/show-paid-monitoring";

interface Props {
	url: string;
	token: string;
}

export const ShowMonitoringModal = ({ url, token }: Props) => {
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
					<ShowPaidMonitoring BASE_URL={url} token={token} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
