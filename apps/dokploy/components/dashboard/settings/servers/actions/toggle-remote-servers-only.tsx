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

export const ToggleRemoteServersOnly = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();

	const { mutateAsync } = api.settings.updateRemoteServersOnly.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ remoteServersOnly: checked });
			await refetch();
			toast.success("Remote Servers Only updated");
		} catch {
			toast.error("Error updating Remote Servers Only");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={!!data?.remoteServersOnly}
				onCheckedChange={handleToggle}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Remote Servers Only
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							When enabled, all services (applications, databases, compose) must
							be deployed to a remote server. Deploying directly to the Dokploy
							host VM is not allowed.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
