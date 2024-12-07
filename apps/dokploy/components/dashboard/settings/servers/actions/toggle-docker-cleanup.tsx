import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { useTranslation } from "next-i18next";

interface Props {
	serverId?: string;
}
export const ToggleDockerCleanup = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const { data, refetch } = api.admin.one.useQuery(undefined, {
		enabled: !serverId,
	});

	const { data: server, refetch: refetchServer } = api.server.one.useQuery(
		{
			serverId: serverId || "",
		},
		{
			enabled: !!serverId,
		},
	);

	const enabled = data?.enableDockerCleanup || server?.enableDockerCleanup;

	const { mutateAsync } = api.settings.updateDockerCleanup.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({
				enableDockerCleanup: checked,
				serverId: serverId,
			});
			if (serverId) {
				await refetchServer();
			} else {
				await refetch();
			}
			toast.success(t("server.webServer.updates.dockerCleanupUpdated"));
		} catch (error) {
			toast.error(t("server.webServer.updates.dockerCleanupError"));
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!enabled} onCheckedChange={handleToggle} />
			<Label className="text-primary">
				{t("settings.server.webServer.dailyDockerCleanup")}	
			</Label>		
		</div>
	);
};
