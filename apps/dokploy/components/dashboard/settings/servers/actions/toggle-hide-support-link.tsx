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

export const ToggleHideSupportLink = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateHideSupportLink.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ hideSupportLink: checked });
			await refetch();
			toast.success("Hide Support Link updated");
		} catch (error: any) {
			toast.error(error?.message || "Error updating Hide Support Link");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={!!data?.hideSupportLink}
				onCheckedChange={handleToggle}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Hide Support Link
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							Hide the "Support" link from the sidebar. Cannot be enabled if a
							custom Support URL is set in Whitelabeling.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
