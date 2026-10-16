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

export const ToggleHideSSOButton = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateHideSSOButton.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ hideSSOButton: checked });
			await refetch();
			toast.success("Hide SSO Button updated");
		} catch (error: any) {
			toast.error(error?.message || "Error updating Hide SSO Button");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!data?.hideSSOButton} onCheckedChange={handleToggle} />
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Hide SSO Button
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							Hide the SSO sign-in option from the login page. Cannot be enabled
							if SSO providers are configured or Enforce SSO is active.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
