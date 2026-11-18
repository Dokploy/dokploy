import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";
import { ErrorState, LoadingState, SectionHeader } from "./section-header";

interface Props {
	serverId: string;
}

const STALE_PACKAGE_LISTS_MS = 7 * 24 * 60 * 60 * 1000;

export const UpdatesTab = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const { data, isPending, isError, error, refetch, isRefetching } =
		api.serverSecurity.pendingUpdates.useQuery({ serverId }, { retry: false });

	if (isPending)
		return <LoadingState label={t("settings.servers.security.updates.checking")} />;
	if (isError)
		return (
			<ErrorState
				message={error.message}
				onRetry={() => refetch()}
				isRetrying={isRefetching}
			/>
		);

	const pending = data.pendingSecurityUpdates ?? [];
	const rebootRequiredBy = data.rebootRequiredBy ?? [];
	const listsAreStale =
		!data.listsUpdatedAt ||
		Date.now() - data.listsUpdatedAt > STALE_PACKAGE_LISTS_MS;

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title={t("settings.servers.security.updates.title")}
				description={t("settings.servers.security.updates.description")}
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>

			{!data.supported ? (
				<AlertBlock type="info">
					{t("settings.servers.security.updates.notSupported")}
				</AlertBlock>
			) : !data.checkSucceeded ? (
				<AlertBlock type="error">
					{t("settings.servers.security.updates.checkFailed")}{" "}
					<code>apt list --upgradable</code>{" "}
					{t("settings.servers.security.updates.checkFailedSuffix")}
				</AlertBlock>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					<div className="md:col-span-2">
						{listsAreStale ? (
							<AlertBlock type="warning">
								{data.listsUpdatedAt
									? t("settings.servers.security.updates.staleRefreshed", {
											when: formatDistanceToNow(data.listsUpdatedAt, {
												addSuffix: true,
											}),
										})
									: t("settings.servers.security.updates.staleNever")}
								,{" "}
								{t("settings.servers.security.updates.stalePrefix")}{" "}
								<code>apt update</code>{" "}
								{t("settings.servers.security.updates.staleSuffix")}
							</AlertBlock>
						) : (
							<p className="text-xs text-muted-foreground">
								{t("settings.servers.security.updates.listsRefreshed", {
									when: formatDistanceToNow(data.listsUpdatedAt ?? 0, {
										addSuffix: true,
									}),
								})}
							</p>
						)}
					</div>
					<div className="rounded-lg border p-4">
						<div className="flex items-center justify-between">
							<h4 className="text-sm font-semibold">
								{t("settings.servers.security.updates.pendingSecurity")}
							</h4>
							<Badge variant={pending.length > 0 ? "yellow" : "green"}>
								{pending.length}
							</Badge>
						</div>
						{pending.length > 0 ? (
							<div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
								{pending.map((pkg) => (
									<Badge key={pkg} variant="blank" className="font-mono">
										{pkg}
									</Badge>
								))}
							</div>
						) : (
							<p className="mt-2 text-sm text-muted-foreground">
								{t("settings.servers.security.updates.upToDate")}
							</p>
						)}
					</div>
					<div className="rounded-lg border p-4">
						<div className="flex items-center justify-between">
							<h4 className="text-sm font-semibold">
								{t("settings.servers.security.updates.rebootRequired")}
							</h4>
							<Badge variant={data.rebootRequired ? "orange" : "green"}>
								{data.rebootRequired
									? t("settings.servers.security.updates.yes")
									: t("settings.servers.security.updates.no")}
							</Badge>
						</div>
						<p className="mt-2 text-sm text-muted-foreground">
							{data.rebootRequired
								? t("settings.servers.security.updates.rebootText", {
										packages:
											rebootRequiredBy.join(", ") ||
											t("settings.servers.security.updates.systemPackages"),
									})
								: t("settings.servers.security.updates.noRebootNeeded")}
						</p>
					</div>
				</div>
			)}
		</div>
	);
};
