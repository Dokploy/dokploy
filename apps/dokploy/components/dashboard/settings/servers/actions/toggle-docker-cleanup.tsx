import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { HelpCircle } from "lucide-react";
import { toast } from "sonner";

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
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Daily Docker Cleanup
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>
							Runs a full Docker cleanup daily, pruning stopped containers,
							unused images, volumes, build cache, and system resources. This
							may remove images built for Compose services that run on-demand
							(backup runners, cron jobs, one-off tasks).
						</p>
						<p className="mt-1">
							For custom cleanup strategies, use{" "}
							<a
								href="https://docs.dokploy.com/docs/core/schedule-jobs#example-1-automatic-docker-cleanup"
								target="_blank"
								rel="noopener noreferrer"
								className="underline text-primary"
							>
								Schedule Jobs
							</a>{" "}
							on your web server or remote servers.
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
