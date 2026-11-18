import { useTranslation } from "react-i18next";
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
	critical: {
		variant: "red",
		label: "settings.servers.security.ports.riskCritical",
	},
	high: {
		variant: "orange",
		label: "settings.servers.security.ports.riskHigh",
	},
	medium: {
		variant: "yellow",
		label: "settings.servers.security.ports.riskReview",
	},
	info: {
		variant: "blank",
		label: "settings.servers.security.ports.riskExpected",
	},
} as const;

interface Props {
	serverId: string;
}

export const ExposedPortsTab = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const { data, isPending, isError, error, refetch, isRefetching } =
		api.serverSecurity.exposedPorts.useQuery({ serverId }, { retry: false });

	if (isPending)
		return (
			<LoadingState label={t("settings.servers.security.ports.scanning")} />
		);
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
				title={t("settings.servers.security.ports.title")}
				description={t("settings.servers.security.ports.description")}
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>

			<div className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
				<span className="font-medium">
					{t("settings.servers.security.ports.firewall")}
				</span>
				{!ufw?.installed ? (
					<Badge variant="blank">
						{t("settings.servers.security.ports.notInstalled")}
					</Badge>
				) : (
					<>
						<Badge variant={ufw.active ? "green" : "red"}>
							{ufw.active
								? t("settings.servers.security.ports.active")
								: t("settings.servers.security.ports.inactive")}
						</Badge>
						{ufw.active && ufw.defaultIncoming && (
							<span className="text-muted-foreground">
								{t("settings.servers.security.ports.defaultIncoming")}{" "}
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
					{t("settings.servers.security.ports.riskyAlert", {
						count: risky.length,
					})}
				</AlertBlock>
			)}
			{hasDockerPorts && (
				<AlertBlock type="warning">
					{t("settings.servers.security.ports.dockerWarning")}
				</AlertBlock>
			)}

			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("settings.servers.security.ports.port")}</TableHead>
							<TableHead>
								{t("settings.servers.security.ports.service")}
							</TableHead>
							<TableHead>
								{t("settings.servers.security.ports.process")}
							</TableHead>
							<TableHead>
								{t("settings.servers.security.ports.listeningOn")}
							</TableHead>
							<TableHead>{t("settings.servers.security.ports.risk")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{ports.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-center text-muted-foreground"
								>
									{t("settings.servers.security.ports.noPorts")}
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
										<TableCell>
											{port.label ??
												t("settings.servers.security.ports.unknown")}
										</TableCell>
										<TableCell>
											<div className="flex flex-col">
												<span>{port.dockerName ?? port.process ?? "-"}</span>
												{port.dockerName && (
													<span className="text-xs text-muted-foreground">
														{t("settings.servers.security.ports.docker")}
													</span>
												)}
											</div>
										</TableCell>
										<TableCell className="font-mono text-xs">
											{port.addresses.join(", ")}
										</TableCell>
										<TableCell>
											<Badge variant={badge.variant}>{t(badge.label)}</Badge>
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
