import { ShowSchedules } from "@/components/dashboard/application/schedules/show-schedules";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useState } from "react";

interface Props {
	serverId: string;
}

export const ShowSchedulesModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Show Schedules
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-5xl  overflow-y-auto max-h-screen ">
				<ShowSchedules id={serverId} scheduleType="server" />
			</DialogContent>
		</Dialog>
	);
};
