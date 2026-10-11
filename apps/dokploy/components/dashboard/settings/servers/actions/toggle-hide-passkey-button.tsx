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

export const ToggleHidePasskeyButton = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateHidePasskeyButton.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ hidePasskeyButton: checked });
			await refetch();
			toast.success("Hide Passkey Button updated");
		} catch (error: any) {
			toast.error(error?.message || "Error updating Hide Passkey Button");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={!!data?.hidePasskeyButton}
				onCheckedChange={handleToggle}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Hide Passkey Button
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							Hide the passkey sign-in button and passkey setup from the
							interface. Cannot be enabled if any user has passkeys configured.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
