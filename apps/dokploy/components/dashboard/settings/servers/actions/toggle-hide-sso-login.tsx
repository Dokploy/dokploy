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

export const ToggleHideSSOLogin = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateHideSSOLogin.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ hideSSOLogin: checked });
			await refetch();
			toast.success("Hide SSO Login updated");
		} catch {
			toast.error("Error updating Hide SSO Login");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!data?.hideSSOLogin} onCheckedChange={handleToggle} />
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Hide SSO Login
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							When enabled, the "Sign in with SSO" option is hidden from the
							login page. Has no effect when "Enforce SSO" is on.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
