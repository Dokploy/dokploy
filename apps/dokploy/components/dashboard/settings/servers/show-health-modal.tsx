import { Stethoscope } from "lucide-react";
import { useState } from "react";
import { ShowHealth } from "@/components/dashboard/docker/health/show-health";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface Props {
	serverId: string;
}

export const ShowHealthModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="icon" className="h-9 w-9">
					<Stethoscope className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
				<div className="flex gap-4 py-4 w-full">
					<ShowHealth serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
