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

export const ToggleShowSSO = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateShowSSOInSidebar.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ showSSOInSidebar: checked });
			await refetch();
			toast.success("Single Sign-On (SSO) updated");
		} catch {
			toast.error("Error updating Single Sign-On (SSO)");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={data?.showSSOInSidebar !== false}
				onCheckedChange={handleToggle}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Single Sign-On (SSO)
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>When enabled, the SSO settings appear in the sidebar.</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
