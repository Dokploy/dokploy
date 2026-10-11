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

export const ToggleHideSocialIcons = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateHideSocialIcons.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ hideSocialIcons: checked });
			await refetch();
			toast.success("Hide Social Icons updated");
		} catch (error: any) {
			toast.error(error?.message || "Error updating Hide Social Icons");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={!!data?.hideSocialIcons}
				onCheckedChange={handleToggle}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Hide Social Icons
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							When enabled, GitHub, X, and Discord icons are hidden on login and
							registration pages.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
