import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { SetupMonitoring } from "../servers/setup-monitoring";

export const MonitoringSetupAction = () => {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">Monitoring</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Monitoring</DialogTitle>
				</DialogHeader>
				<div className="rounded-xl bg-background">
					<SetupMonitoring />
				</div>
			</DialogContent>
		</Dialog>
	);
};
