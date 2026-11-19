import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();

	const { mutateAsync } = api.settings.updateRemoteServersOnly.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ remoteServersOnly: checked });
			await refetch();
			toast.success(t("settings.servers.remoteServersOnly.updated"));
		} catch {
			toast.error(t("settings.servers.remoteServersOnly.updateError"));
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
							{t("settings.servers.remoteServersOnly.label")}
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>{t("settings.servers.remoteServersOnly.description")}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
