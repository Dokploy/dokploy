import { LayoutDashboardIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { SetupMonitoring } from "./setup-monitoring";

interface Props {
	serverId: string;
}

export const SetupMonitoringModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<DialogTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="h-9 w-9"
								onClick={() => setIsOpen(true)}
							>
								<LayoutDashboardIcon className="h-4 w-4" />
							</Button>
						</DialogTrigger>
					</TooltipTrigger>
					<TooltipContent>
						<p>Configure Monitoring</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
				<SetupMonitoring serverId={serverId} />
			</DialogContent>
		</Dialog>
	);
};
