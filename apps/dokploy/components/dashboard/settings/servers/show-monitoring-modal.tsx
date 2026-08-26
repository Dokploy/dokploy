import { BarChartHorizontalBigIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ShowPaidMonitoring } from "../../monitoring/paid/servers/show-paid-monitoring";

interface Props {
	serverId: string;
}

export const ShowMonitoringModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="icon" className="h-9 w-9">
					<BarChartHorizontalBigIcon className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-7xl  ">
				<div className="flex gap-4 py-4 w-full">
					<ShowPaidMonitoring serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
