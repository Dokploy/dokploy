import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

interface Props {
	/**
	 * When provided, configures the cgroup parent for that remote server. When
	 * omitted, configures the local Dokploy web server.
	 */
	serverId?: string;
	/** Optional title override (e.g. the server name in a list). */
	label?: string;
}

/**
 * Control to set the cgroup parent passed to `docker build --cgroup-parent`,
 * either for a remote server (`serverId` provided) or the local web server
 * (omitted). Not shown in cloud.
 */
export const BuildCgroupParent = ({ serverId, label }: Props) => {
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const serverQuery = api.server.one.useQuery(
		{ serverId: serverId ?? "" },
		{ enabled: !!serverId },
	);
	const webServerQuery = api.settings.getWebServerSettings.useQuery(undefined, {
		enabled: !serverId,
	});

	const current = serverId
		? serverQuery.data?.buildCgroupParent
		: webServerQuery.data?.buildCgroupParent;
	const refetch = serverId ? serverQuery.refetch : webServerQuery.refetch;

	const updateServer = api.server.updateBuildCgroupParent.useMutation();
	const updateWebServer = api.settings.updateBuildCgroupParent.useMutation();
	const isPending = serverId
		? updateServer.isPending
		: updateWebServer.isPending;

	const [value, setValue] = useState("");

	useEffect(() => {
		setValue(current ?? "");
	}, [current]);

	// Build cgroup parent is a self-hosted feature; not shown in cloud.
	if (isCloud) return null;

	const handleSave = async () => {
		const trimmed = value.trim();
		try {
			if (serverId) {
				await updateServer.mutateAsync({
					serverId,
					buildCgroupParent: trimmed,
				});
			} else {
				await updateWebServer.mutateAsync({ buildCgroupParent: trimmed });
			}
			await refetch();
			toast.success("Build cgroup parent updated");
		} catch {
			toast.error("Error updating build cgroup parent");
		}
	};

	const hasChanges = value.trim() !== (current ?? "");

	return (
		<div className="flex flex-col gap-3 rounded-lg border p-3">
			<div className="flex flex-row items-center justify-between gap-4">
				<div className="space-y-0.5">
					<div className="flex items-center gap-2">
						<p className="text-sm font-medium">
							{label ?? serverQuery.data?.name ?? "Dokploy Server"}
						</p>
						<span className="text-xs text-muted-foreground rounded border px-1.5 py-0.5">
							{serverId
								? (serverQuery.data?.ipAddress ?? "remote server")
								: "local host"}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Input
						type="text"
						placeholder="/builds"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						className="w-56 font-mono"
					/>
					<Button
						type="button"
						size="sm"
						onClick={handleSave}
						isLoading={isPending}
						disabled={!hasChanges}
					>
						Save
					</Button>
				</div>
			</div>
		</div>
	);
};
