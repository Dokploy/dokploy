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

interface Props {
	serverId?: string;
}
export const ToggleDockerCleanup = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const { data, refetch } = api.settings.getWebServerSettings.useQuery(
		undefined,
		{
			enabled: !serverId,
		},
	);

	const { data: server, refetch: refetchServer } = api.server.one.useQuery(
		{
			serverId: serverId || "",
		},
		{
			enabled: !!serverId,
		},
	);

	const enabled = serverId
		? server?.enableDockerCleanup
		: data?.enableDockerCleanup;

	const { mutateAsync } = api.settings.updateDockerCleanup.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({
				enableDockerCleanup: checked,
				...(serverId && { serverId }),
			} as {
				enableDockerCleanup: boolean;
				serverId?: string;
			});
			if (serverId) {
				await refetchServer();
			} else {
				await refetch();
			}
			toast.success(t("settings.servers.dockerCleanup.updated"));
		} catch {
			toast.error(t("settings.servers.dockerCleanup.updateError"));
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!enabled} onCheckedChange={handleToggle} />
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							{t("settings.servers.dockerCleanup.label")}
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>{t("settings.servers.dockerCleanup.description")}</p>
						<p className="mt-1">
							{t("settings.servers.dockerCleanup.scheduleJobsPrefix")}{" "}
							<a
								href="https://docs.dokploy.com/docs/core/schedule-jobs#example-1-automatic-docker-cleanup"
								target="_blank"
								rel="noopener noreferrer"
								className="underline text-primary"
							>
								{t("settings.servers.dockerCleanup.scheduleJobs")}
							</a>{" "}
							{t("settings.servers.dockerCleanup.scheduleJobsSuffix")}
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
