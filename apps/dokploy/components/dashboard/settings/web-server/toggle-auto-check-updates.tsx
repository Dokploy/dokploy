import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export const ToggleAutoCheckUpdates = () => {
	const [enabled, setEnabled] = useState<boolean>(
		localStorage.getItem("enableAutoCheckUpdates") === "true",
	);

	const handleToggle = async (checked: boolean) => {
		setEnabled(checked);
		localStorage.setItem("enableAutoCheckUpdates", String(checked));
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={enabled}
				onCheckedChange={handleToggle}
				id="autoCheckUpdatesToggle"
			/>
			<Label className="text-primary" htmlFor="autoCheckUpdatesToggle">
				Automatically check for new updates
			</Label>
		</div>
	);
};
