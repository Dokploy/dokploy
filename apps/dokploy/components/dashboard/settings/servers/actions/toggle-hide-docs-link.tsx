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

export const ToggleHideDocsLink = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const { mutateAsync } = api.settings.updateHideDocsLink.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ hideDocsLink: checked });
			await refetch();
			toast.success("Hide Documentation Link updated");
		} catch (error: any) {
			toast.error(error?.message || "Error updating Hide Documentation Link");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!data?.hideDocsLink} onCheckedChange={handleToggle} />
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Hide Documentation Link
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							Hide the "Documentation" link from the sidebar. Cannot be enabled
							if a custom Documentation URL is set in Whitelabeling.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
