import { AlertBlock } from "@/components/shared/alert-block";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/utils/api";
import { CloudflareConfigForm } from "./cloudflare-config-form";
import { CloudflareZoneList } from "./cloudflare-zone-list";
import { LocalTunnelSection } from "./local-tunnel-section";

export const ShowCloudflare = () => {
	const configQuery = api.cloudflare.getConfig.useQuery();
	const permissionsQuery = api.user.getPermissions.useQuery();
	const cloudQuery = api.settings.isCloud.useQuery();

	if (
		configQuery.isPending ||
		permissionsQuery.isPending ||
		cloudQuery.isPending
	) {
		return (
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
				{["config", "zones", "tunnel"].map((section) => (
					<div key={section} className="space-y-4 rounded-xl border p-6">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-4 w-full max-w-xl" />
						<Skeleton className="h-20 w-full" />
					</div>
				))}
			</div>
		);
	}

	const pageError =
		configQuery.error ?? permissionsQuery.error ?? cloudQuery.error;
	if (pageError) {
		return (
			<AlertBlock type="error" className="mx-auto w-full max-w-5xl">
				<p className="font-medium">Cloudflare settings could not be loaded.</p>
				<p className="text-xs">{pageError.message}</p>
			</AlertBlock>
		);
	}

	const permissions = permissionsQuery.data?.cloudflare;
	const configData = configQuery.data;
	const hasConfig = !!configData?.config;

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<CloudflareConfigForm
				data={configData}
				canCreate={!!permissions?.create}
				canUpdate={!!permissions?.update}
				canDelete={!!permissions?.delete}
			/>
			{hasConfig ? (
				<>
					<CloudflareZoneList
						zones={configData?.zones ?? []}
						accounts={configData?.config?.accounts ?? []}
						canUpdate={!!permissions?.update}
					/>
					{cloudQuery.data === false ? (
						<LocalTunnelSection canUpdate={!!permissions?.update} />
					) : null}
				</>
			) : null}
		</div>
	);
};
