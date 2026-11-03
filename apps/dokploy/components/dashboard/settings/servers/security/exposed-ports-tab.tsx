import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { ErrorState, LoadingState, SectionHeader } from "./section-header";

const RISK_BADGES = {
	critical: { variant: "red", label: "Critical" },
	high: { variant: "orange", label: "High" },
	medium: { variant: "yellow", label: "Review" },
	info: { variant: "blank", label: "Expected" },
} as const;

interface Props {
	serverId: string;
}

export const ExposedPortsTab = ({ serverId }: Props) => {
	const { data, isPending, isError, error, refetch, isRefetching } =
		api.serverSecurity.exposedPorts.useQuery({ serverId }, { retry: false });

	if (isPending) return <LoadingState label="Scanning listening ports..." />;
	if (isError)
		return (
			<ErrorState
				message={error.message}
				onRetry={() => refetch()}
				isRetrying={isRefetching}
			/>
		);

	const ports = data?.ports ?? [];
	const ufw = data?.ufw;
	const risky = ports.filter(
		(port) => port.risk === "critical" || port.risk === "high",
	);
	const hasDockerPorts = ports.some((port) => port.dockerName);

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title="Exposed Ports"
				description="Ports listening on a public interface of this server."
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>

			<div className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
				<span className="font-medium">Firewall (UFW)</span>
				{!ufw?.installed ? (
					<Badge variant="blank">Not installed</Badge>
				) : (
					<>
						<Badge variant={ufw.active ? "green" : "red"}>
							{ufw.active ? "Active" : "Inactive"}
						</Badge>
						{ufw.active && ufw.defaultIncoming && (
							<span className="text-muted-foreground">
								Default incoming:{" "}
								<span className="font-medium text-foreground">
									{ufw.defaultIncoming}
								</span>
							</span>
						)}
					</>
				)}
			</div>

			{risky.length > 0 && (
				<AlertBlock type="error">
					{risky.length} sensitive{" "}
					{risky.length === 1 ? "port is" : "ports are"} reachable from outside.
					Unless they are meant to be public, stop publishing them or restrict
					access with a firewall at your cloud provider.
				</AlertBlock>
			)}
			{hasDockerPorts && (
				<AlertBlock type="warning">
					Ports published by Docker bypass UFW rules: blocking them in UFW does
					not make them private.
				</AlertBlock>
			)}

			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Port</TableHead>
							<TableHead>Service</TableHead>
							<TableHead>Process</TableHead>
							<TableHead>Listening on</TableHead>
							<TableHead>Risk</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{ports.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-center text-muted-foreground"
								>
									No public ports found
								</TableCell>
							</TableRow>
						) : (
							ports.map((port) => {
								const badge = RISK_BADGES[port.risk];
								return (
									<TableRow key={`${port.protocol}/${port.port}`}>
										<TableCell className="font-mono">
											{port.port}/{port.protocol}
										</TableCell>
										<TableCell>{port.label ?? "Unknown"}</TableCell>
										<TableCell>
											<div className="flex flex-col">
												<span>{port.dockerName ?? port.process ?? "-"}</span>
												{port.dockerName && (
													<span className="text-xs text-muted-foreground">
														Docker
													</span>
												)}
											</div>
										</TableCell>
										<TableCell className="font-mono text-xs">
											{port.addresses.join(", ")}
										</TableCell>
										<TableCell>
											<Badge variant={badge.variant}>{badge.label}</Badge>
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
};
