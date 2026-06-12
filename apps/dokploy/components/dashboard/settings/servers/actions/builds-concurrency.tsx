import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const clamp = (value: number) => Math.min(20, Math.max(1, value));

interface Props {
	/**
	 * When provided, configures concurrency for that remote server. When
	 * omitted, configures the local Dokploy web server.
	 */
	serverId?: string;
}

/**
 * Enterprise-only control to set the number of concurrent builds, either for a
 * remote server (`serverId` provided) or the local web server (omitted).
 * Hidden when the instance has no valid license.
 */
export const BuildsConcurrency = ({ serverId }: Props) => {
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: haveValidLicense } =
		api.licenseKey.haveValidLicenseKey.useQuery();

	const serverQuery = api.server.one.useQuery(
		{ serverId: serverId ?? "" },
		{ enabled: !!serverId },
	);
	const webServerQuery = api.settings.getWebServerSettings.useQuery(undefined, {
		enabled: !serverId,
	});

	const current = serverId
		? serverQuery.data?.buildsConcurrency
		: webServerQuery.data?.buildsConcurrency;
	const refetch = serverId ? serverQuery.refetch : webServerQuery.refetch;

	const updateServer = api.server.updateBuildsConcurrency.useMutation();
	const updateWebServer = api.settings.updateBuildsConcurrency.useMutation();
	const isPending = serverId
		? updateServer.isPending
		: updateWebServer.isPending;

	const [value, setValue] = useState("1");

	useEffect(() => {
		if (current) {
			setValue(String(current));
		}
	}, [current]);

	// Concurrent builds are a self-hosted enterprise feature; not shown in cloud.
	if (isCloud || !haveValidLicense) return null;

	const handleSave = async () => {
		const parsed = clamp(Number.parseInt(value, 10) || 1);
		setValue(String(parsed));
		try {
			if (serverId) {
				await updateServer.mutateAsync({ serverId, buildsConcurrency: parsed });
			} else {
				await updateWebServer.mutateAsync({ buildsConcurrency: parsed });
			}
			await refetch();
			toast.success("Builds concurrency updated");
		} catch {
			toast.error("Error updating builds concurrency");
		}
	};

	const hasChanges = Number(value) !== (current ?? 1);

	return (
		<div className="flex flex-row items-center justify-between rounded-lg border p-3">
			<div className="space-y-0.5">
				<p className="text-sm font-medium">Concurrent Builds</p>
				<p className="text-sm text-muted-foreground">
					Maximum number of deployments that can build at the same time on
					{serverId ? " this server" : " the local Dokploy server"}. Builds of
					the same service are always serialized.
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Input
					type="number"
					min={1}
					max={20}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					className="w-20"
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
	);
};
