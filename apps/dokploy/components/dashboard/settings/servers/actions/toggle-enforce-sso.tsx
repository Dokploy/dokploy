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

export const ToggleEnforceSSO = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateEnforceSSO.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ enforceSSO: checked });
			await refetch();
			toast.success("Enforce SSO updated");
		} catch {
			toast.error("Error updating Enforce SSO");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!data?.enforceSSO} onCheckedChange={handleToggle} />
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Enforce SSO
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							When enabled, the email/password login form is hidden and users
							must sign in exclusively through SSO.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
