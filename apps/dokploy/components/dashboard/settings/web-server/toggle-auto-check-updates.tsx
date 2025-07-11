import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "next-i18next";
import { useState } from "react";

export const ToggleAutoCheckUpdates = ({ disabled }: { disabled: boolean }) => {
	const { t } = useTranslation("settings");
	const [enabled, setEnabled] = useState<boolean>(
		localStorage.getItem("enableAutoCheckUpdates") === "true",
	);

	const handleToggle = (checked: boolean) => {
		setEnabled(checked);
		localStorage.setItem("enableAutoCheckUpdates", String(checked));
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={enabled}
				onCheckedChange={handleToggle}
				id="autoCheckUpdatesToggle"
				disabled={disabled}
			/>
			<Label className="text-primary" htmlFor="autoCheckUpdatesToggle">
				{t("settings.webServer.toggleAutoCheckUpdates.description")}
			</Label>
		</div>
	);
};
