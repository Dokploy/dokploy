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

export const ToggleShowWhitelabeling = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } =
		api.settings.updateShowWhitelabelingInSidebar.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ showWhitelabelingInSidebar: checked });
			await refetch();
			toast.success("Whitelabeling (Branding) updated");
		} catch {
			toast.error("Error updating Whitelabeling (Branding)");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={data?.showWhitelabelingInSidebar !== false}
				onCheckedChange={handleToggle}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Whitelabeling (Branding)
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							When enabled, the Whitelabeling settings appear in the sidebar.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
