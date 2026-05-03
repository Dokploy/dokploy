import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import { FleetHealthStrip, type FleetServer } from "./fleet-health-strip";
import { ServerMonitoringPane } from "./server-monitoring-pane";
import { isTimeRange, type TimeRange } from "./time-range-picker";

const LOCAL_KEY = "__local__";

const serverKey = (serverId: string | null) => serverId ?? LOCAL_KEY;

export const MonitoringPage = () => {
	const { data: remoteServers, isLoading } = api.server.all.useQuery();
	const { data: localMeta, isLoading: isLocalMetaLoading } =
		api.user.getMetricsToken.useQuery();

	const fleet: FleetServer[] = useMemo(() => {
		const localConfigured = Boolean(localMeta?.metricsConfig?.server?.token);
		const local: FleetServer = {
			serverId: null,
			name: "Dokploy primary",
			configured: localConfigured,
			thresholds: localMeta?.metricsConfig?.server?.thresholds,
		};
		const remotes: FleetServer[] = (remoteServers ?? [])
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((s) => ({
				serverId: s.serverId,
				name: s.name,
				configured: Boolean(s.metricsConfig?.server?.token),
				thresholds: s.metricsConfig?.server?.thresholds,
			}));
		return [local, ...remotes];
	}, [remoteServers, localMeta]);

	const [activeServerId, setActiveServerId] = useState<string | null>(null);
	const [range, setRange] = useState<TimeRange>("1h");

	if (isLoading || isLocalMetaLoading) {
		return (
			<div className="flex h-[40vh] items-center justify-center">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const firstConfigured = fleet.find((s) => s.configured);
	const activeServer =
		fleet.find((s) => s.serverId === activeServerId) ??
		firstConfigured ??
		fleet[0];

	if (!activeServer) return null;

	return (
		<div className="space-y-4">
			<FleetHealthStrip
				servers={fleet}
				activeServerId={activeServer.serverId}
				onSelect={setActiveServerId}
			/>
			<Tabs
				value={serverKey(activeServer.serverId)}
				onValueChange={(v) => setActiveServerId(v === LOCAL_KEY ? null : v)}
			>
				<TabsList className="h-auto flex-wrap justify-start">
					{fleet.map((s) => (
						<TabsTrigger
							key={serverKey(s.serverId)}
							value={serverKey(s.serverId)}
						>
							{s.name}
						</TabsTrigger>
					))}
				</TabsList>
				{fleet.map((s) => (
					<TabsContent
						key={serverKey(s.serverId)}
						value={serverKey(s.serverId)}
						className="mt-4"
					>
						<ServerMonitoringPane
							serverId={s.serverId}
							serverName={s.name}
							configured={s.configured}
							range={isTimeRange(range) ? range : "1h"}
							onRangeChange={setRange}
						/>
					</TabsContent>
				))}
			</Tabs>
		</div>
	);
};
