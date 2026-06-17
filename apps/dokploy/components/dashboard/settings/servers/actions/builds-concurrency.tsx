import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

// Free tier may set up to 2 concurrent builds; enterprise unlocks more.
const FREE_MAX_CONCURRENCY = 2;
const ENTERPRISE_MAX_CONCURRENCY = 100;

interface Props {
	/**
	 * When provided, configures concurrency for that remote server. When
	 * omitted, configures the local Dokploy web server.
	 */
	serverId?: string;
	/** Optional title override (e.g. the server name in a list). */
	label?: string;
}

/**
 * Control to set the number of concurrent builds, either for a remote server
 * (`serverId` provided) or the local web server (omitted). Available to
 * everyone self-hosted up to FREE_MAX_CONCURRENCY; higher values require a
 * valid enterprise license. Not shown in cloud.
 */
export const BuildsConcurrency = ({ serverId, label }: Props) => {
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

	// Concurrent builds are a self-hosted feature; not shown in cloud.
	if (isCloud) return null;

	const max = haveValidLicense
		? ENTERPRISE_MAX_CONCURRENCY
		: FREE_MAX_CONCURRENCY;
	const clamp = (n: number) => Math.min(max, Math.max(1, n));

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
						type="number"
						min={1}
						max={max}
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
		</div>
	);
};
