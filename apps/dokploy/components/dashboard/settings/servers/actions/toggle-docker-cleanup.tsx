import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { toast } from "sonner";

interface Props {
	serverId?: string;
}
export const ToggleDockerCleanup = ({ serverId }: Props) => {
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
	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={enabled}
				onCheckedChange={async (e) => {
					await mutateAsync({
						enableDockerCleanup: e,
						serverId: serverId,
					})
						.then(async () => {
							toast.success("Docker Cleanup Enabled");
						})
						.catch(() => {
							toast.error("Docker Cleanup Error");
						});

					if (serverId) {
						refetchServer();
					} else {
						refetch();
					}
				}}
			/>
			<Label className="text-primary">Daily Docker Cleanup</Label>
		</div>
	);
};
