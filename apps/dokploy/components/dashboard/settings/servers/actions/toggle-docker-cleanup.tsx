import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";

interface Props {
	serverId?: string;
}
export const ToggleDockerCleanup = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const { data, refetch } = api.user.get.useQuery(undefined, {
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

	const enabled = serverId
		? server?.enableDockerCleanup
		: data?.user.enableDockerCleanup;

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
			toast.success(t("settings.dockerCleanup.dockerCleanupUpdated"));
		} catch {
			toast.error(t("settings.dockerCleanup.dockerCleanupError"));
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!enabled} onCheckedChange={handleToggle} />
			<Label className="text-primary">
				{t("settings.dockerCleanup.dailyDockerCleanup")}
			</Label>
		</div>
	);
};
