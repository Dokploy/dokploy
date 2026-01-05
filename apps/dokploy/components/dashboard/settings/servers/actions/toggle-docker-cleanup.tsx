import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
}
export const ToggleDockerCleanup = ({ serverId }: Props) => {
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
			toast.success("Docker Cleanup updated");
		} catch {
			toast.error("Docker Cleanup Error");
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Switch checked={!!enabled} onCheckedChange={handleToggle} />
			<Label className="text-primary">Daily Docker Cleanup</Label>
		</div>
	);
};
