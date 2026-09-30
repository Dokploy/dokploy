import {
	Activity,
	ChevronsUpDown,
	ExternalLink,
	Loader2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CompactContainerMonitoring } from "@/components/dashboard/monitoring/free/container/compact-container-monitoring";
import { CompactPaidContainerMonitoring } from "@/components/dashboard/monitoring/paid/container/compact-paid-container-monitoring";
import {
	LibsqlIcon,
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

export type MonitoringService = {
	serverId?: string | null;
	serverName?: string | null;
	serverIp?: string | null;
	metricsPort?: number | null;
	metricsConfigured?: boolean;
	name: string;
	appName?: string | null;
	replicas?: number;
	composeType?: "docker-compose" | "stack";
	type:
		| "mariadb"
		| "application"
		| "postgres"
		| "mysql"
		| "mongo"
		| "redis"
		| "compose"
		| "libsql";
	id: string;
};

interface Props {
	projectId: string;
	environmentId: string;
	services: MonitoringService[];
}

const serviceTypeIcon = (type: MonitoringService["type"]) => {
	switch (type) {
		case "postgres":
			return <PostgresqlIcon className="size-4" />;
		case "mysql":
			return <MysqlIcon className="size-4" />;
		case "mariadb":
			return <MariadbIcon className="size-4" />;
		case "mongo":
			return <MongodbIcon className="size-4" />;
		case "redis":
			return <RedisIcon className="size-4" />;
		case "libsql":
			return <LibsqlIcon className="size-4" />;
		default:
			return <Activity className="size-4 text-muted-foreground" />;
	}
};

const serviceHref = (
	projectId: string,
	environmentId: string,
	service: MonitoringService,
) =>
	`/dashboard/project/${projectId}/environment/${environmentId}/services/${service.type}/${service.id}?tab=monitoring`;

const getStorageKey = (environmentId: string) =>
	`project-monitoring-selection:${environmentId}`;

export const ProjectMonitoring = ({
	projectId,
	environmentId,
	services,
}: Props) => {
	const monitorableServices = useMemo(() => services, [services]);

	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [showReplicas, setShowReplicas] = useState(false);
	const [selectorOpen, setSelectorOpen] = useState(false);
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		try {
			const raw = localStorage.getItem(getStorageKey(environmentId));
			if (raw) {
				const parsed = JSON.parse(raw) as {
					selectedIds?: string[];
					showReplicas?: boolean;
				};
				if (Array.isArray(parsed.selectedIds)) {
					const validIds = parsed.selectedIds.filter((id) =>
						monitorableServices.some((service) => service.id === id),
					);
					if (parsed.selectedIds.length === 0) {
						setSelectedIds([]);
					} else if (validIds.length > 0) {
						setSelectedIds(validIds);
					} else {
						setSelectedIds(
							monitorableServices.slice(0, 3).map((service) => service.id),
						);
					}
				} else {
					setSelectedIds(
						monitorableServices.slice(0, 3).map((service) => service.id),
					);
				}
				setShowReplicas(!!parsed.showReplicas);
			} else {
				setSelectedIds(
					monitorableServices.slice(0, 3).map((service) => service.id),
				);
			}
		} catch {
			setSelectedIds(
				monitorableServices.slice(0, 3).map((service) => service.id),
			);
		}
		setHydrated(true);
	}, [environmentId, monitorableServices]);

	useEffect(() => {
		if (!hydrated) return;
		localStorage.setItem(
			getStorageKey(environmentId),
			JSON.stringify({ selectedIds, showReplicas }),
		);
	}, [selectedIds, showReplicas, environmentId, hydrated]);

	const selectedServices = useMemo(
		() =>
			monitorableServices.filter((service) => selectedIds.includes(service.id)),
		[monitorableServices, selectedIds],
	);

	const toggleService = (id: string) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
		);
	};

	const selectAll = () => {
		setSelectedIds(monitorableServices.map((service) => service.id));
	};

	const clearAll = () => {
		setSelectedIds([]);
	};

	if (!hydrated) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				Loading monitoring...
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-2.5 rounded-lg border bg-background px-3.5 py-2.5">
					<Switch
						id="show-replicas"
						checked={showReplicas}
						onCheckedChange={setShowReplicas}
					/>
					<Label
						htmlFor="show-replicas"
						className="cursor-pointer text-sm whitespace-nowrap"
					>
						Show replicas
					</Label>
				</div>

				<Popover open={selectorOpen} onOpenChange={setSelectorOpen}>
					<PopoverTrigger asChild>
						<Button variant="outline" className="justify-between min-w-[240px]">
							<span className="truncate">
								Services ({selectedIds.length}/{monitorableServices.length})
							</span>
							<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[320px] p-0" align="start">
						<Command>
							<CommandInput placeholder="Search services..." />
							<div className="flex items-center justify-between px-3 py-2 border-b">
								<Button variant="ghost" size="sm" onClick={selectAll}>
									Select all
								</Button>
								<Button variant="ghost" size="sm" onClick={clearAll}>
									Clear
								</Button>
							</div>
							<CommandEmpty>No services found.</CommandEmpty>
							<CommandGroup className="max-h-72 overflow-auto">
								{monitorableServices.map((service) => {
									const checked = selectedIds.includes(service.id);
									return (
										<CommandItem
											key={service.id}
											value={`${service.name} ${service.type}`}
											onSelect={() => toggleService(service.id)}
											className="gap-2"
										>
											<Checkbox checked={checked} />
											{serviceTypeIcon(service.type)}
											<span className="truncate flex-1">{service.name}</span>
											<Badge variant="outline" className="text-[10px]">
												{service.type}
											</Badge>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</Command>
					</PopoverContent>
				</Popover>
			</div>

			{monitorableServices.length === 0 ? (
				<AlertBlock type="info">
					No services in this environment to monitor.
				</AlertBlock>
			) : selectedServices.length === 0 ? (
				<AlertBlock type="info">
					Select one or more services to start monitoring.
				</AlertBlock>
			) : (
				<div className="flex flex-col gap-10">
					{selectedServices.map((service) => (
						<ServiceMonitoringPanel
							key={service.id}
							projectId={projectId}
							environmentId={environmentId}
							service={service}
							showReplicas={showReplicas}
						/>
					))}
				</div>
			)}
		</div>
	);
};

const ServiceMonitoringPanel = ({
	projectId,
	environmentId,
	service,
	showReplicas,
}: {
	projectId: string;
	environmentId: string;
	service: MonitoringService;
	showReplicas: boolean;
}) => {
	const usePaid = !!service.serverId;
	const appName = service.appName || "";
	const appType =
		service.type === "compose"
			? service.composeType || "docker-compose"
			: "application";

	const { data: containers, isPending } =
		api.docker.getContainersByAppNameMatch.useQuery(
			{
				appName,
				appType: service.type === "compose" ? appType : undefined,
				serverId: service.serverId || undefined,
			},
			{
				enabled: showReplicas && !!appName && !usePaid,
			},
		);

	return (
		<section className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex items-start gap-3 min-w-0">
					<div className="mt-0.5">{serviceTypeIcon(service.type)}</div>
					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<p className="text-base font-medium truncate">{service.name}</p>
							<Badge variant="secondary" className="capitalize">
								{service.type}
							</Badge>
						</div>
						<p className="text-sm text-muted-foreground truncate">
							{appName || "No app name"}
							{service.serverName ? ` · ${service.serverName}` : ""}
							{service.type !== "compose" && (service.replicas ?? 1) > 1
								? ` · ${service.replicas} replicas`
								: ""}
						</p>
					</div>
				</div>
				<Button variant="outline" size="sm" className="shrink-0" asChild>
					<Link href={serviceHref(projectId, environmentId, service)}>
						Open
						<ExternalLink className="ml-1.5 size-3.5" />
					</Link>
				</Button>
			</div>

			{!appName ? (
				<p className="text-sm text-muted-foreground">
					This service has no app name configured.
				</p>
			) : usePaid ? (
				service.serverId && service.metricsConfigured ? (
					<CompactPaidContainerMonitoring
						appName={appName}
						serverId={service.serverId}
						serviceId={service.id}
					/>
				) : (
					<p className="text-sm text-muted-foreground">
						Monitoring is not configured on this remote server.
					</p>
				)
			) : showReplicas ? (
				isPending ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
						<Loader2 className="size-4 animate-spin" />
						Loading containers...
					</div>
				) : containers && containers.length > 0 ? (
					<div className="flex flex-col gap-6">
						{containers.map((container) => (
							<div key={container.containerId} className="flex flex-col gap-3">
								<p className="text-sm font-medium text-muted-foreground">
									{container.name}{" "}
									<span className="font-normal">({container.state})</span>
								</p>
								<CompactContainerMonitoring
									appName={container.name}
									appType={
										service.type === "compose" ? appType : "application"
									}
									serviceId={service.id}
									containerId={container.containerId}
								/>
							</div>
						))}
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">
							No running replica containers found. Showing service-level
							metrics.
						</p>
						<CompactContainerMonitoring
							appName={appName}
							appType={service.type === "compose" ? appType : "application"}
							serviceId={service.id}
						/>
					</div>
				)
			) : (
				<CompactContainerMonitoring
					appName={appName}
					appType={service.type === "compose" ? appType : "application"}
					serviceId={service.id}
				/>
			)}
		</section>
	);
};
