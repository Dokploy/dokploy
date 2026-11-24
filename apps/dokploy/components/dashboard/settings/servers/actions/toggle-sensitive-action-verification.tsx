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

export const ToggleSensitiveActionVerification = () => {
	const { data: status } = api.ownershipTransfer.status.useQuery();
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync, isPending } =
		api.settings.updateSensitiveActionVerification.useMutation();

	if (!status?.isInstanceOwner) return null;

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ enabled: checked });
			await refetch();
			toast.success(
				checked
					? "Identity verification enabled"
					: "Identity verification disabled",
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Error updating identity verification",
			);
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={!!data?.requireSensitiveActionVerification}
				onCheckedChange={handleToggle}
				disabled={isPending}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Require identity verification for sensitive actions
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							When enabled, users must confirm their identity (password, passkey
							or SSO) before deleting resources or changing access. Verification
							lasts 5 minutes. API keys are not affected.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
