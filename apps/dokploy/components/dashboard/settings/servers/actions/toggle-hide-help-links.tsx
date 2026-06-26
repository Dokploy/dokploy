import { HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

export const ToggleHideHelpLinks = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateHideHelpLinks.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ hideHelpLinks: checked });
			await refetch();
			toast.success("Hide Help Links updated");
		} catch {
			toast.error("Error updating Hide Help Links");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!data?.hideHelpLinks} onCheckedChange={handleToggle} />
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Hide Help Links
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							When enabled, the Documentation and Support links are hidden from
							the sidebar.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
