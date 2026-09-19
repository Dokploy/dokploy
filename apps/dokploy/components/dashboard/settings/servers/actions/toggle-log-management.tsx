import { HelpCircle, Loader2 } from "lucide-react";
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

export const ToggleLogManagement = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const { data: server } = api.server.one.useQuery(
		{ serverId: serverId || "" },
		{ enabled: !!serverId },
	);
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery(undefined, {
			enabled: !serverId,
		});
	const { mutateAsync: updateServer, isPending: isServerPending } =
		api.server.updateLogManagement.useMutation();
	const { mutateAsync: updateLocal, isPending: isLocalPending } =
		api.settings.updateLogManagement.useMutation();

	const isPending = serverId ? isServerPending : isLocalPending;
	const enabled = serverId
		? !!server?.enableLogManagement
		: !!webServerSettings?.enableLogManagement;

	const handleToggle = async (checked: boolean) => {
		if (serverId) {
			await updateServer({ serverId, enableLogManagement: checked })
				.then((result) => {
					utils.server.one.setData({ serverId }, (old) =>
						old
							? { ...old, enableLogManagement: result.enableLogManagement }
							: old,
					);
					if (checked && !result.installed) {
						toast.message(
							"Log Management enabled, but no log provider is configured yet — add one under Settings > Log Management.",
						);
					} else {
						toast.success("Log Management updated");
					}
				})
				.catch((e) => {
					toast.error(
						e instanceof Error ? e.message : "Error updating Log Management",
					);
				});
			return;
		}

		await updateLocal({ enableLogManagement: checked })
			.then((result) => {
				utils.settings.getWebServerSettings.setData(undefined, (old) =>
					old
						? { ...old, enableLogManagement: result.enableLogManagement }
						: old,
				);
				if (checked && !result.installed) {
					toast.message(
						"Log Management enabled, but no log provider is configured yet — add one under Settings > Log Management.",
					);
				} else {
					toast.success("Log Management updated");
				}
			})
			.catch((e) => {
				toast.error(
					e instanceof Error ? e.message : "Error updating Log Management",
				);
			});
	};

	return (
		<div className="flex items-center gap-4">
			<Switch
				checked={enabled}
				onCheckedChange={handleToggle}
				disabled={isPending}
			/>
			{isPending && (
				<Loader2 className="size-4 animate-spin text-muted-foreground" />
			)}
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							Log Management
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm flex-col items-start">
						<p>
							Ships {serverId ? "this server's" : "this machine's"} container
							logs to the log providers configured under Settings &gt; Log
							Management, via a Vector agent. May take a few seconds to install
							or remove.
						</p>
						<p className="mt-1">
							Has no effect (and installs nothing) unless at least one log
							provider is enabled for this organization.
						</p>
						{!serverId && (
							<p className="mt-1">
								Ships every container on this machine, not just this
								organization's — if another organization on this instance also
								deploys here, its logs ship too (unscoped, no project/app tags).
							</p>
						)}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
