import { DeploymentsTable } from "./deployments-table";
import { MonitoringEmptyState } from "./monitoring-empty-state";
import { SystemMetricsSection } from "./system-metrics-section";
import { type TimeRange, TimeRangePicker } from "./time-range-picker";

interface Props {
	serverId: string | null;
	serverName: string;
	configured: boolean;
	range: TimeRange;
	onRangeChange: (range: TimeRange) => void;
}

export const ServerMonitoringPane = ({
	serverId,
	serverName,
	configured,
	range,
	onRangeChange,
}: Props) => {
	if (!configured) {
		return <MonitoringEmptyState serverId={serverId} serverName={serverName} />;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-bold tracking-tight">{serverName}</h2>
					<p className="text-sm text-muted-foreground">
						System metrics and deployment resource usage
					</p>
				</div>
				<TimeRangePicker value={range} onChange={onRangeChange} />
			</div>
			<SystemMetricsSection serverId={serverId} range={range} />
			<DeploymentsTable serverId={serverId} />
		</div>
	);
};
