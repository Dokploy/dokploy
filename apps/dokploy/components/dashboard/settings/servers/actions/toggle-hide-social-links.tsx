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

export const ToggleHideSocialLinks = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateHideSocialLinks.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ hideSocialLinks: checked });
			await refetch();
			toast.success("Hide Social Links updated");
		} catch {
			toast.error("Error updating Hide Social Links");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={!!data?.hideSocialLinks}
				onCheckedChange={handleToggle}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Hide Social Links
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							When enabled, the GitHub, X, and Discord links are hidden from the
							login and onboarding pages.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
