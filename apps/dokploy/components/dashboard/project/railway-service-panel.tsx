"use client";

import { formatMb } from "@dokploy/server/monitoring/units";
import copy from "copy-to-clipboard";
import {
	Activity,
	ArrowUpRight,
	Ban,
	Check,
	CircuitBoard,
	Code2,
	Copy,
	Cpu,
	Database,
	EllipsisVertical,
	ExternalLink,
	Eye,
	EyeOff,
	Globe2,
	HardDrive,
	HelpCircle,
	Loader2,
	Play,
	Plus,
	RefreshCcw,
	Rocket,
	RotateCcw,
	Search,
	SquareTerminal,
	Table as TableIcon,
	Trash2,
	Wifi,
	X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShowClusterSettings } from "@/components/dashboard/application/advanced/cluster/show-cluster-settings";
import { AddCommand } from "@/components/dashboard/application/advanced/general/add-command";
import { ShowImport } from "@/components/dashboard/application/advanced/import/show-import";
import { ShowPorts } from "@/components/dashboard/application/advanced/ports/show-port";
import { ShowRedirects } from "@/components/dashboard/application/advanced/redirects/show-redirects";
import { ShowSecurity } from "@/components/dashboard/application/advanced/security/show-security";
import { ShowBuildServer } from "@/components/dashboard/application/advanced/show-build-server";
import { ShowResources } from "@/components/dashboard/application/advanced/show-resources";
import { ShowTraefikConfig } from "@/components/dashboard/application/advanced/traefik/show-traefik-config";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { ShowDeployments } from "@/components/dashboard/application/deployments/show-deployments";
import { ShowDomains } from "@/components/dashboard/application/domains/show-domains";
import { ShowGeneralApplication } from "@/components/dashboard/application/general/show";
import { ShowIconSettings } from "@/components/dashboard/application/icon/show-icon-settings";
import { ShowPatches } from "@/components/dashboard/application/patches/show-patches";
import { ShowPreviewDeployments } from "@/components/dashboard/application/preview-deployments/show-preview-deployments";
import { ShowRollbackSettings } from "@/components/dashboard/application/rollbacks/show-rollback-settings";
import { ShowSchedules } from "@/components/dashboard/application/schedules/show-schedules";
import { UpdateApplication } from "@/components/dashboard/application/update-application";
import { ShowVolumeBackups } from "@/components/dashboard/application/volume-backups/show-volume-backups";
import { AddCommandCompose } from "@/components/dashboard/compose/advanced/add-command";
import { IsolatedDeploymentTab } from "@/components/dashboard/compose/advanced/add-isolation";
import { DeleteService } from "@/components/dashboard/compose/delete-service";
import { ShowGeneralCompose } from "@/components/dashboard/compose/general/show";
import { UpdateCompose } from "@/components/dashboard/compose/update-compose";
import { ShowBackups } from "@/components/dashboard/database/backups/show-backups";
import { ShowExternalLibsqlCredentials } from "@/components/dashboard/libsql/general/show-external-libsql-credentials";
import { ShowGeneralLibsql } from "@/components/dashboard/libsql/general/show-general-libsql";
import { ShowInternalLibsqlCredentials } from "@/components/dashboard/libsql/general/show-internal-libsql-credentials";
import { UpdateLibsql } from "@/components/dashboard/libsql/update-libsql";
import { ShowExternalMariadbCredentials } from "@/components/dashboard/mariadb/general/show-external-mariadb-credentials";
import { ShowGeneralMariadb } from "@/components/dashboard/mariadb/general/show-general-mariadb";
import { ShowInternalMariadbCredentials } from "@/components/dashboard/mariadb/general/show-internal-mariadb-credentials";
import { UpdateMariadb } from "@/components/dashboard/mariadb/update-mariadb";
import { ShowExternalMongoCredentials } from "@/components/dashboard/mongo/general/show-external-mongo-credentials";
import { ShowGeneralMongo } from "@/components/dashboard/mongo/general/show-general-mongo";
import { ShowInternalMongoCredentials } from "@/components/dashboard/mongo/general/show-internal-mongo-credentials";
import { UpdateMongo } from "@/components/dashboard/mongo/update-mongo";
import { DockerBlockChart } from "@/components/dashboard/monitoring/free/container/docker-block-chart";
import { DockerCpuChart } from "@/components/dashboard/monitoring/free/container/docker-cpu-chart";
import { DockerDiskChart } from "@/components/dashboard/monitoring/free/container/docker-disk-chart";
import { DockerMemoryChart } from "@/components/dashboard/monitoring/free/container/docker-memory-chart";
import { DockerNetworkChart } from "@/components/dashboard/monitoring/free/container/docker-network-chart";
import {
	convertMemoryToBytes,
	type DockerStats,
	type DockerStatsJSON,
} from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ShowExternalMysqlCredentials } from "@/components/dashboard/mysql/general/show-external-mysql-credentials";
import { ShowGeneralMysql } from "@/components/dashboard/mysql/general/show-general-mysql";
import { ShowInternalMysqlCredentials } from "@/components/dashboard/mysql/general/show-internal-mysql-credentials";
import { UpdateMysql } from "@/components/dashboard/mysql/update-mysql";
import { AssignComposeNetworks } from "@/components/dashboard/networks/assign-compose-networks";
import { AssignNetworks } from "@/components/dashboard/networks/assign-networks";
import { ShowExternalPostgresCredentials } from "@/components/dashboard/postgres/general/show-external-postgres-credentials";
import { ShowGeneralPostgres } from "@/components/dashboard/postgres/general/show-general-postgres";
import { ShowInternalPostgresCredentials } from "@/components/dashboard/postgres/general/show-internal-postgres-credentials";
import { UpdatePostgres } from "@/components/dashboard/postgres/update-postgres";
import { ShowExternalRedisCredentials } from "@/components/dashboard/redis/general/show-external-redis-credentials";
import { ShowGeneralRedis } from "@/components/dashboard/redis/general/show-general-redis";
import { ShowInternalRedisCredentials } from "@/components/dashboard/redis/general/show-internal-redis-credentials";
import { UpdateRedis } from "@/components/dashboard/redis/update-redis";
import { ShowDestinations } from "@/components/dashboard/settings/destination/show-destinations";
import { ShowDatabaseAdvancedSettings } from "@/components/dashboard/shared/show-database-advanced-settings";
import {
	LibsqlIcon,
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { CodeEditor } from "@/components/shared/code-editor";
import { useEnvCompletionSource } from "@/components/shared/env-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { RailwayLogs } from "./railway-logs";
import type { RailwayService } from "./railway-service-types";

const DockerTerminal = dynamic(
	() =>
		import("@/components/dashboard/docker/terminal/docker-terminal").then(
			(module) => module.DockerTerminal,
		),
	{ ssr: false },
);

export type PanelTab =
	| "deployments"
	| "variables"
	| "metrics"
	| "console"
	| "settings";

type Props = {
	service: RailwayService;
	projectId: string;
	environmentId: string;
	initialTab?: PanelTab;
	activeTab?: PanelTab;
	onTabChange?: (tab: PanelTab) => void;
	onClose: () => void;
	onRemove?: () => void;
};

const PANEL_TABS: Array<{ id: PanelTab; label: string }> = [
	{ id: "deployments", label: "Deployments" },
	{ id: "variables", label: "Variables" },
	{ id: "metrics", label: "Metrics" },
	{ id: "console", label: "Console" },
	{ id: "settings", label: "Settings" },
];

const ServiceIcon = ({
	service,
	className = "size-6",
}: {
	service: RailwayService;
	className?: string;
}) => {
	if (service.icon) {
		return (
			<img
				src={service.icon}
				alt=""
				className={cn("rounded-lg object-contain", className)}
			/>
		);
	}
	switch (service.type) {
		case "application":
			return <Globe2 className={cn("text-sky-400", className)} />;
		case "compose":
			return <CircuitBoard className={cn("text-violet-400", className)} />;
		case "postgres":
			return <PostgresqlIcon className={cn("text-indigo-400", className)} />;
		case "mysql":
			return <MysqlIcon className={cn("text-orange-400", className)} />;
		case "mariadb":
			return <MariadbIcon className={cn("text-cyan-400", className)} />;
		case "mongo":
			return <MongodbIcon className={cn("text-emerald-400", className)} />;
		case "redis":
			return <RedisIcon className={cn("text-rose-400", className)} />;
		case "libsql":
			return <LibsqlIcon className={cn("text-yellow-400", className)} />;
		default:
			return <Database className={cn("text-indigo-400", className)} />;
	}
};

/* -------------------------------------------------------------------------- */
/*                          1. DEPLOYMENTS SUBTAB                             */
/* -------------------------------------------------------------------------- */

const RailwayDeploymentsTab = ({
	service,
	projectId,
	environmentId,
	isActionLoading,
	onRemove,
	onRestart,
	onRedeploy,
}: {
	service: RailwayService;
	projectId: string;
	environmentId: string;
	isActionLoading: boolean;
	onRemove?: () => void;
	onRestart: () => Promise<void>;
	onRedeploy: () => Promise<void>;
}) => {
	const isDeployable =
		service.type === "application" || service.type === "compose";
	const [showLogs, setShowLogs] = useState(false);
	const { data: appData } = api.application.one.useQuery(
		{ applicationId: service.id },
		{ enabled: service.type === "application" && !!service.id },
	);
	const { data: composeData } = api.compose.one.useQuery(
		{ composeId: service.id },
		{ enabled: service.type === "compose" && !!service.id },
	);
	// Without a refresh token ShowDeployments hides the deploy webhook URL, which
	// is Railway's equivalent of a deploy trigger.
	const refreshToken =
		(service.type === "application"
			? appData?.refreshToken
			: composeData?.refreshToken) ?? service.refreshToken;
	const { data: deployments, isPending } = api.deployment.allByType.useQuery(
		{
			id: service.id,
			type: service.type === "application" ? "application" : "compose",
		},
		{
			enabled: isDeployable && !!service.id,
			refetchInterval: 3000,
		},
	);
	const activeDeployment = deployments?.[0];
	const serviceLabel =
		service.domain || service.description || service.appName || service.name;
	const formatAge = (value: Date | string) => {
		const elapsedSeconds = Math.max(
			1,
			Math.floor((Date.now() - new Date(value).getTime()) / 1000),
		);
		if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
		const minutes = Math.floor(elapsedSeconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		const months = Math.floor(days / 30);
		return `${months}mo ago`;
	};

	if (showLogs) {
		return (
			<div className="space-y-4">
				<button
					type="button"
					onClick={() => setShowLogs(false)}
					className="text-sm text-[#aaa6b5] transition-colors hover:text-white"
				>
					← Back to deployments
				</button>
				<RailwayLogs
					service={service}
					projectId={projectId}
					environmentId={environmentId}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
				<div className="flex min-w-0 items-center gap-2 text-[#e8e5ed]">
					<Globe2 className="size-4 shrink-0 text-emerald-500" />
					<span className="truncate">{serviceLabel}</span>
				</div>
				<div className="flex items-center gap-4 text-[#777383]">
					<span className="flex items-center gap-2">
						<ServiceIcon service={service} className="size-4" />
						{service.type}
					</span>
					{service.serverName && <span>{service.serverName}</span>}
					{appData?.replicas !== undefined && (
						<span>
							{appData.replicas}{" "}
							{appData.replicas === 1 ? "Replica" : "Replicas"}
						</span>
					)}
				</div>
			</div>

			{!isDeployable ? (
				<div className="rounded-xl border border-[#34313f] bg-[#1b1926] px-5 py-6">
					<div className="flex items-center gap-3">
						<Database className="size-5 text-indigo-400" />
						<div>
							<p className="text-sm font-medium text-[#eeeaf6]">
								Continuous database instance
							</p>
							<p className="mt-1 text-sm text-[#8f8b9b]">
								This service runs continuously. Open its logs to inspect runtime
								activity.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={() => setShowLogs(true)}
						className="mt-4 rounded-lg border border-[#3a3745] px-3 py-2 text-sm text-[#c7c3cf] hover:bg-white/[0.05] hover:text-white"
					>
						View logs
					</button>
				</div>
			) : isPending ? (
				<div className="flex h-24 items-center justify-center text-[#878291]">
					<Loader2 className="size-5 animate-spin" />
				</div>
			) : (
				<>
					{activeDeployment && (
						<div className="overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-950/10">
							<div className="flex items-center gap-4 px-5 py-4">
								<span className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
									ACTIVE
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm text-[#f0edf4]">
										{activeDeployment.title?.trim() || "Manual deployment"}
									</p>
									<p className="mt-1 text-sm text-[#868190]">
										{formatAge(activeDeployment.createdAt)} via Dokploy
									</p>
								</div>
								<button
									type="button"
									onClick={() => setShowLogs(true)}
									className="rounded-lg border border-emerald-500/25 px-3.5 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10"
								>
									View logs
								</button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											aria-label="Deployment actions"
											className="rounded-md p-1 text-[#aaa5b2] hover:bg-white/[0.06] hover:text-white"
										>
											<EllipsisVertical className="size-5" />
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-44">
										<DropdownMenuItem onSelect={() => setShowLogs(true)}>
											View logs
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={isActionLoading}
											onSelect={() => void onRestart()}
										>
											Restart
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={isActionLoading}
											onSelect={() => void onRedeploy()}
										>
											Redeploy
										</DropdownMenuItem>
										{onRemove && (
											<>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													className="text-red-400 focus:text-red-300"
													onSelect={onRemove}
												>
													Remove
												</DropdownMenuItem>
											</>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
							<div className="flex items-center gap-3 border-t border-emerald-500/15 px-5 py-3 text-sm text-emerald-400">
								<Check className="size-4" />
								{activeDeployment.status === "done"
									? "Deployment successful"
									: `Deployment ${activeDeployment.status}`}
							</div>
						</div>
					)}

					<div className="flex items-center justify-between pt-1 text-xs">
						<span className="font-medium text-[#d9d5df]">HISTORY</span>
						<span className="text-[#777383]">Latest deployments</span>
					</div>

					<div className="railway-deployment-history overflow-hidden rounded-xl border border-[#34313f] bg-[#1c1a28] p-3">
						<ShowDeployments
							id={service.id}
							refreshToken={refreshToken || ""}
							serverId={service.serverId || undefined}
							type={service.type === "application" ? "application" : "compose"}
						/>
					</div>
				</>
			)}
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/*                            2. VARIABLES TAB                                */
/* -------------------------------------------------------------------------- */

interface EnvVariableRow {
	id: string;
	key: string;
	value: string;
}

const parseEnvToRows = (raw: string): EnvVariableRow[] => {
	if (!raw) return [];
	const lines = raw.split("\n");
	const rows: EnvVariableRow[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim() || "";
		if (!line || line.startsWith("#")) continue;
		const eqIdx = line.indexOf("=");
		if (eqIdx !== -1) {
			const key = line.slice(0, eqIdx).trim();
			let value = line.slice(eqIdx + 1);
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			rows.push({
				id: `var-${i}-${key || Math.random().toString(36).slice(2, 7)}`,
				key,
				value,
			});
		}
	}
	return rows;
};

const rowsToEnvString = (rows: EnvVariableRow[]): string => {
	return rows
		.filter((r) => r.key.trim().length > 0)
		.map((r) => `${r.key.trim()}=${r.value}`)
		.join("\n");
};

const RailwayVariablesTab = ({
	service,
	projectId,
	environmentId,
}: {
	service: RailwayService;
	projectId: string;
	environmentId: string;
}) => {
	const utils = api.useUtils();
	const isApplication = service.type === "application";
	const isCompose = service.type === "compose";

	const { data: permissions } = api.user.getPermissions.useQuery();
	const canWrite = permissions?.envVars.write ?? true;

	// Service-specific data queries
	const { data: appData, refetch: refetchApp } = api.application.one.useQuery(
		{ applicationId: service.id },
		{ enabled: isApplication },
	);
	const { data: composeData, refetch: refetchCompose } =
		api.compose.one.useQuery({ composeId: service.id }, { enabled: isCompose });
	const { data: pgData, refetch: refetchPg } = api.postgres.one.useQuery(
		{ postgresId: service.id },
		{ enabled: service.type === "postgres" },
	);
	const { data: mysqlData, refetch: refetchMysql } = api.mysql.one.useQuery(
		{ mysqlId: service.id },
		{ enabled: service.type === "mysql" },
	);
	const { data: mariadbData, refetch: refetchMariadb } =
		api.mariadb.one.useQuery(
			{ mariadbId: service.id },
			{ enabled: service.type === "mariadb" },
		);
	const { data: mongoData, refetch: refetchMongo } = api.mongo.one.useQuery(
		{ mongoId: service.id },
		{ enabled: service.type === "mongo" },
	);
	const { data: redisData, refetch: refetchRedis } = api.redis.one.useQuery(
		{ redisId: service.id },
		{ enabled: service.type === "redis" },
	);
	const { data: libsqlData, refetch: refetchLibsql } = api.libsql.one.useQuery(
		{ libsqlId: service.id },
		{ enabled: service.type === "libsql" },
	);

	const genericData = isApplication
		? appData
		: isCompose
			? composeData
			: service.type === "postgres"
				? pgData
				: service.type === "mysql"
					? mysqlData
					: service.type === "mariadb"
						? mariadbData
						: service.type === "mongo"
							? mongoData
							: service.type === "redis"
								? redisData
								: libsqlData;

	// Mutations
	const { mutateAsync: saveAppEnv, isPending: isSavingApp } =
		api.application.saveEnvironment.useMutation();
	const { mutateAsync: saveComposeEnv, isPending: isSavingCompose } =
		api.compose.saveEnvironment.useMutation();
	const { mutateAsync: savePgEnv, isPending: isSavingPg } =
		api.postgres.saveEnvironment.useMutation();
	const { mutateAsync: saveMysqlEnv, isPending: isSavingMysql } =
		api.mysql.saveEnvironment.useMutation();
	const { mutateAsync: saveMariadbEnv, isPending: isSavingMariadb } =
		api.mariadb.saveEnvironment.useMutation();
	const { mutateAsync: saveMongoEnv, isPending: isSavingMongo } =
		api.mongo.saveEnvironment.useMutation();
	const { mutateAsync: saveRedisEnv, isPending: isSavingRedis } =
		api.redis.saveEnvironment.useMutation();
	const { mutateAsync: saveLibsqlEnv, isPending: isSavingLibsql } =
		api.libsql.saveEnvironment.useMutation();

	const isSaving =
		isSavingApp ||
		isSavingCompose ||
		isSavingPg ||
		isSavingMysql ||
		isSavingMariadb ||
		isSavingMongo ||
		isSavingRedis ||
		isSavingLibsql;

	// Autocomplete source
	const completionSource = useEnvCompletionSource({
		projectEnv: genericData?.environment?.project?.env,
		environmentEnv: genericData?.environment?.env,
		projectId,
		environmentId,
	});

	// Variables Tab State
	const [viewMode, setViewMode] = useState<"table" | "raw">("table");
	const [search, setSearch] = useState<string>("");
	const [revealAll, setRevealAll] = useState<boolean>(false);
	const [revealedRowIds, setRevealedRowIds] = useState<Set<string>>(new Set());
	const [copiedKey, setCopiedKey] = useState<string | null>(null);

	// Form values state
	const [rawEnv, setRawEnv] = useState<string>("");
	const [tableRows, setTableRows] = useState<EnvVariableRow[]>([]);
	const [buildArgs, setBuildArgs] = useState<string>("");
	const [buildSecrets, setBuildSecrets] = useState<string>("");
	const [createEnvFile, setCreateEnvFile] = useState<boolean>(true);
	const [isInitialized, setIsInitialized] = useState<boolean>(false);

	// Sync initial data from query
	useEffect(() => {
		if (genericData && !isInitialized) {
			const envVal = genericData.env || "";
			setRawEnv(envVal);
			setTableRows(parseEnvToRows(envVal));

			if (isApplication && appData) {
				setBuildArgs(appData.buildArgs || "");
				setBuildSecrets(appData.buildSecrets || "");
				setCreateEnvFile(appData.createEnvFile ?? true);
			} else if (isCompose && composeData) {
				const composeObj = composeData as { createEnvFile?: boolean };
				setCreateEnvFile(composeObj.createEnvFile ?? true);
			}
			setIsInitialized(true);
		}
	}, [
		genericData,
		isInitialized,
		isApplication,
		appData,
		isCompose,
		composeData,
	]);

	// Calculate changes
	const initialEnv = genericData?.env || "";
	const initialBuildArgs = (isApplication && appData?.buildArgs) || "";
	const initialBuildSecrets = (isApplication && appData?.buildSecrets) || "";
	const initialCreateEnvFile = isApplication
		? (appData?.createEnvFile ?? true)
		: isCompose
			? ((composeData as { createEnvFile?: boolean })?.createEnvFile ?? true)
			: true;

	const hasChanges =
		rawEnv !== initialEnv ||
		(isApplication &&
			(buildArgs !== initialBuildArgs ||
				buildSecrets !== initialBuildSecrets ||
				createEnvFile !== initialCreateEnvFile)) ||
		(isCompose && createEnvFile !== initialCreateEnvFile);

	// Handlers for switching modes
	const handleSwitchToTable = () => {
		setTableRows(parseEnvToRows(rawEnv));
		setViewMode("table");
	};

	const handleSwitchToRaw = () => {
		const formatted = rowsToEnvString(tableRows);
		setRawEnv(formatted);
		setViewMode("raw");
	};

	// Row operations in Table mode
	const handleAddRow = () => {
		const newRow: EnvVariableRow = {
			id: `var-new-${Date.now()}`,
			key: "",
			value: "",
		};
		const updated = [...tableRows, newRow];
		setTableRows(updated);
		setRawEnv(rowsToEnvString(updated));
	};

	const handleUpdateRowKey = (id: string, newKey: string) => {
		const updated = tableRows.map((r) =>
			r.id === id ? { ...r, key: newKey } : r,
		);
		setTableRows(updated);
		setRawEnv(rowsToEnvString(updated));
	};

	const handleUpdateRowValue = (id: string, newValue: string) => {
		const updated = tableRows.map((r) =>
			r.id === id ? { ...r, value: newValue } : r,
		);
		setTableRows(updated);
		setRawEnv(rowsToEnvString(updated));
	};

	const handleDeleteRow = (id: string) => {
		const updated = tableRows.filter((r) => r.id !== id);
		setTableRows(updated);
		setRawEnv(rowsToEnvString(updated));
	};

	const handleToggleRowReveal = (id: string) => {
		setRevealedRowIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const handleCopyValue = (rowKey: string, val: string) => {
		copy(val);
		setCopiedKey(rowKey);
		toast.success(`Copied value for ${rowKey}`);
		setTimeout(() => setCopiedKey(null), 1500);
	};

	const handleCopyReference = (refText: string) => {
		copy(refText);
		toast.success(`Copied reference: ${refText}`);
	};

	// Save all variables
	const handleSave = async () => {
		try {
			if (isApplication) {
				await saveAppEnv({
					applicationId: service.id,
					env: rawEnv,
					buildArgs,
					buildSecrets,
					createEnvFile,
				});
				await refetchApp();
			} else if (isCompose) {
				await saveComposeEnv({
					composeId: service.id,
					env: rawEnv,
					createEnvFile,
				});
				await refetchCompose();
			} else if (service.type === "postgres") {
				await savePgEnv({ postgresId: service.id, env: rawEnv });
				await refetchPg();
			} else if (service.type === "mysql") {
				await saveMysqlEnv({ mysqlId: service.id, env: rawEnv });
				await refetchMysql();
			} else if (service.type === "mariadb") {
				await saveMariadbEnv({ mariadbId: service.id, env: rawEnv });
				await refetchMariadb();
			} else if (service.type === "mongo") {
				await saveMongoEnv({ mongoId: service.id, env: rawEnv });
				await refetchMongo();
			} else if (service.type === "redis") {
				await saveRedisEnv({ redisId: service.id, env: rawEnv });
				await refetchRedis();
			} else if (service.type === "libsql") {
				await saveLibsqlEnv({ libsqlId: service.id, env: rawEnv });
				await refetchLibsql();
			}
			toast.success("Environment variables saved successfully");
			utils.project.one.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to save environment variables",
			);
		}
	};

	const handleDiscard = () => {
		setRawEnv(initialEnv);
		setTableRows(parseEnvToRows(initialEnv));
		setBuildArgs(initialBuildArgs);
		setBuildSecrets(initialBuildSecrets);
		setCreateEnvFile(initialCreateEnvFile);
		toast.info("Changes discarded");
	};

	// Keyboard shortcut Ctrl+S / Cmd+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.code === "KeyS" && !isSaving) {
				e.preventDefault();
				if (hasChanges && canWrite) {
					handleSave();
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		hasChanges,
		canWrite,
		isSaving,
		rawEnv,
		buildArgs,
		buildSecrets,
		createEnvFile,
	]);

	// Filter rows by search
	const filteredRows = useMemo(() => {
		if (!search.trim()) return tableRows;
		const q = search.toLowerCase();
		return tableRows.filter(
			(r) =>
				r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q),
		);
	}, [tableRows, search]);

	const isDockerfile = isApplication && appData?.buildType === "dockerfile";

	return (
		<div className="space-y-6">
			{/* Top Controls Toolbar */}
			<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#231f32] bg-[#141120] p-4 shadow-sm">
				{/* Mode Switcher */}
				<div className="flex items-center gap-3">
					<div className="inline-flex items-center rounded-lg border border-[#2b273c] bg-[#161322] p-1 shadow-inner">
						<button
							type="button"
							onClick={handleSwitchToTable}
							className={cn(
								"flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
								viewMode === "table"
									? "bg-violet-600/25 text-violet-200 border border-violet-500/40 shadow-xs"
									: "text-[#8e8a9c] hover:text-[#e4e1ed] border border-transparent",
							)}
						>
							<TableIcon className="size-3.5" />
							<span>Table View</span>
						</button>
						<button
							type="button"
							onClick={handleSwitchToRaw}
							className={cn(
								"flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
								viewMode === "raw"
									? "bg-violet-600/25 text-violet-200 border border-violet-500/40 shadow-xs"
									: "text-[#8e8a9c] hover:text-[#e4e1ed] border border-transparent",
							)}
						>
							<Code2 className="size-3.5" />
							<span>Raw Editor (.env)</span>
						</button>
					</div>

					{viewMode === "table" && (
						<span className="text-xs text-[#7e7a8d]">
							{filteredRows.length} variable
							{filteredRows.length === 1 ? "" : "s"}
						</span>
					)}
				</div>

				{/* Right Actions Toolbar */}
				<div className="flex flex-wrap items-center gap-2.5">
					{viewMode === "table" && (
						<>
							{/* Search input */}
							<div className="relative flex items-center">
								<Search className="absolute left-2.5 size-3.5 text-[#6c687a]" />
								<Input
									type="text"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Filter variables..."
									className="h-8 w-44 pl-8 pr-7 text-xs bg-[#161322] border-[#2b273c] text-[#eae6f4] placeholder:text-[#635f72] focus:border-violet-500/50"
								/>
								{search && (
									<button
										type="button"
										onClick={() => setSearch("")}
										className="absolute right-2 text-[#7f7b8d] hover:text-white"
									>
										<X className="size-3" />
									</button>
								)}
							</div>

							{/* Reveal / Mask Secrets toggle */}
							<Button
								variant="outline"
								size="sm"
								onClick={() => setRevealAll((v) => !v)}
								className="h-8 gap-1.5 border-[#2b273c] bg-[#161322] text-xs text-[#c9c5d6] hover:bg-white/[0.08] hover:text-white"
							>
								{revealAll ? (
									<>
										<EyeOff className="size-3.5 text-amber-400" />
										<span>Mask Secrets</span>
									</>
								) : (
									<>
										<Eye className="size-3.5 text-violet-400" />
										<span>Reveal Secrets</span>
									</>
								)}
							</Button>

							{/* Add Variable Button */}
							{canWrite && (
								<Button
									variant="outline"
									size="sm"
									onClick={handleAddRow}
									className="h-8 gap-1.5 border-violet-500/40 bg-violet-600/15 text-xs font-medium text-violet-200 hover:bg-violet-600/25 hover:text-white"
								>
									<Plus className="size-3.5" />
									<span>Add Variable</span>
								</Button>
							)}
						</>
					)}
				</div>
			</div>

			{/* Railway Reference Syntax Hints Banner */}
			<div className="rounded-xl border border-[#231f32] bg-[#141120]/80 p-4 shadow-sm">
				<div className="flex items-start gap-3">
					<div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-400">
						<HelpCircle className="size-3.5" />
					</div>
					<div className="flex-1 text-xs leading-relaxed text-[#9a95a8]">
						<p className="font-semibold text-[#dcd7e8]">
							Cross-Service & Dynamic References:
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={() =>
									handleCopyReference("${{ postgres.DATABASE_URL }}")
								}
								className="inline-flex items-center gap-1.5 rounded-md border border-[#2e2940] bg-[#1a1727] px-2.5 py-1 font-mono text-[11px] text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-950/30"
								title="Click to copy syntax"
							>
								<code>${"{{ postgres.DATABASE_URL }}"}</code>
								<Copy className="size-2.5 text-[#736f82]" />
							</button>

							<button
								type="button"
								onClick={() =>
									handleCopyReference("${{ environment.API_PORT }}")
								}
								className="inline-flex items-center gap-1.5 rounded-md border border-[#2e2940] bg-[#1a1727] px-2.5 py-1 font-mono text-[11px] text-sky-300 transition-colors hover:border-sky-500/50 hover:bg-sky-950/30"
								title="Click to copy syntax"
							>
								<code>${"{{ environment.API_PORT }}"}</code>
								<Copy className="size-2.5 text-[#736f82]" />
							</button>

							<button
								type="button"
								onClick={() =>
									handleCopyReference("${{ vault.aws.SECRET_KEY }}")
								}
								className="inline-flex items-center gap-1.5 rounded-md border border-[#2e2940] bg-[#1a1727] px-2.5 py-1 font-mono text-[11px] text-emerald-300 transition-colors hover:border-emerald-500/50 hover:bg-emerald-950/30"
								title="Click to copy syntax"
							>
								<code>${"{{ vault.provider.secret }}"}</code>
								<Copy className="size-2.5 text-[#736f82]" />
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Main Editor: Table vs Raw */}
			{viewMode === "table" ? (
				<div className="rounded-xl border border-[#231f32] bg-[#141120] overflow-hidden shadow-sm">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-xs border-collapse">
							<thead>
								<tr className="border-b border-[#231f32] bg-[#120f1d] text-[#817d90]">
									<th className="py-3 px-4 font-semibold uppercase tracking-wider text-[11px] w-[35%]">
										Variable Name (Key)
									</th>
									<th className="py-3 px-4 font-semibold uppercase tracking-wider text-[11px] w-[53%]">
										Value
									</th>
									<th className="py-3 px-4 font-semibold uppercase tracking-wider text-[11px] text-right w-[12%]">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-[#231f32]/60">
								{filteredRows.length > 0 ? (
									filteredRows.map((row) => {
										const isRowRevealed =
											revealAll || revealedRowIds.has(row.id);
										const isCopied = copiedKey === row.key;

										return (
											<tr
												key={row.id}
												className="transition-colors hover:bg-white/[0.02]"
											>
												<td className="p-3 align-middle">
													<Input
														type="text"
														value={row.key}
														onChange={(e) =>
															handleUpdateRowKey(row.id, e.target.value)
														}
														disabled={!canWrite}
														placeholder="VARIABLE_KEY"
														className="h-9 font-mono text-xs uppercase bg-[#161322] border-[#2b273c] text-white focus:border-violet-500/60"
													/>
												</td>
												<td className="p-3 align-middle">
													<Input
														type={isRowRevealed ? "text" : "password"}
														value={row.value}
														onChange={(e) =>
															handleUpdateRowValue(row.id, e.target.value)
														}
														disabled={!canWrite}
														placeholder="value"
														className="h-9 font-mono text-xs bg-[#161322] border-[#2b273c] text-[#ece8f7] focus:border-violet-500/60"
													/>
												</td>
												<td className="p-3 align-middle text-right">
													<div className="flex items-center justify-end gap-1.5">
														<TooltipProvider delayDuration={150}>
															<Tooltip>
																<TooltipTrigger asChild>
																	<button
																		type="button"
																		onClick={() =>
																			handleToggleRowReveal(row.id)
																		}
																		className="flex size-8 items-center justify-center rounded-lg border border-[#2b273c] bg-[#161322] text-[#8e8a9c] hover:bg-white/[0.08] hover:text-white"
																	>
																		{isRowRevealed ? (
																			<EyeOff className="size-3.5 text-amber-400" />
																		) : (
																			<Eye className="size-3.5" />
																		)}
																	</button>
																</TooltipTrigger>
																<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
																	{isRowRevealed
																		? "Mask value"
																		: "Reveal value"}
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>

														<TooltipProvider delayDuration={150}>
															<Tooltip>
																<TooltipTrigger asChild>
																	<button
																		type="button"
																		onClick={() =>
																			handleCopyValue(row.key, row.value)
																		}
																		className="flex size-8 items-center justify-center rounded-lg border border-[#2b273c] bg-[#161322] text-[#8e8a9c] hover:bg-white/[0.08] hover:text-white"
																	>
																		{isCopied ? (
																			<Check className="size-3.5 text-emerald-400" />
																		) : (
																			<Copy className="size-3.5" />
																		)}
																	</button>
																</TooltipTrigger>
																<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
																	Copy value
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>

														{canWrite && (
															<TooltipProvider delayDuration={150}>
																<Tooltip>
																	<TooltipTrigger asChild>
																		<button
																			type="button"
																			onClick={() => handleDeleteRow(row.id)}
																			className="flex size-8 items-center justify-center rounded-lg border border-[#2b273c] bg-[#161322] text-[#8e8a9c] hover:border-rose-500/40 hover:bg-rose-950/30 hover:text-rose-300"
																		>
																			<Trash2 className="size-3.5" />
																		</button>
																	</TooltipTrigger>
																	<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
																		Delete variable
																	</TooltipContent>
																</Tooltip>
															</TooltipProvider>
														)}
													</div>
												</td>
											</tr>
										);
									})
								) : (
									<tr>
										<td
											colSpan={3}
											className="py-12 text-center text-[#7e7a8e]"
										>
											<div className="flex flex-col items-center justify-center gap-2">
												<TableIcon className="size-8 text-[#4a4658]" />
												<p className="text-sm font-medium text-[#c0bccf]">
													{search
														? "No variables matching filter"
														: "No environment variables configured"}
												</p>
												<p className="text-xs text-[#6e6a7c]">
													{search
														? "Try adjusting or clearing your search term."
														: "Add your first variable using the button above."}
												</p>
												{canWrite && !search && (
													<Button
														variant="outline"
														size="sm"
														onClick={handleAddRow}
														className="mt-3 gap-1.5 border-violet-500/40 bg-violet-600/15 text-xs text-violet-200"
													>
														<Plus className="size-3.5" />
														Add Variable
													</Button>
												)}
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>

					{/* Table Footer */}
					<div className="flex items-center justify-between border-t border-[#231f32] bg-[#120f1d] px-4 py-3 text-xs text-[#7e7a8d]">
						<div>
							Total configured:{" "}
							<strong className="font-mono text-[#dcd7e8]">
								{tableRows.length}
							</strong>
						</div>
						{canWrite && (
							<button
								type="button"
								onClick={handleAddRow}
								className="flex items-center gap-1 text-violet-400 hover:text-violet-300 font-medium"
							>
								<Plus className="size-3.5" /> Add another variable
							</button>
						)}
					</div>
				</div>
			) : (
				<div className="space-y-3">
					<div className="rounded-xl border border-[#231f32] bg-[#141120] p-4 shadow-sm">
						<div className="mb-3 flex items-center justify-between">
							<span className="text-xs font-medium text-[#8e8a9c]">
								Raw Environment (.env format)
							</span>
							<span className="text-[11px] text-[#6b677a]">
								Press Ctrl+S / Cmd+S to save
							</span>
						</div>
						<div className="rounded-lg border border-[#2b273c] bg-[#161322] p-1 font-mono text-xs overflow-hidden">
							<CodeEditor
								value={rawEnv}
								onChange={(val) => {
									setRawEnv(val);
									setTableRows(parseEnvToRows(val));
								}}
								language="properties"
								readOnly={!canWrite}
								completionSource={completionSource}
								lineWrapping
								wrapperClassName="min-h-[320px] font-mono text-xs text-[#eae6f4]"
								placeholder="KEY=VALUE&#10;PORT=3000&#10;DATABASE_URL=..."
							/>
						</div>
					</div>
				</div>
			)}

			{/* Dockerfile Extra Options: Build-time args & secrets */}
			{isDockerfile && (
				<div className="grid gap-6 md:grid-cols-2">
					<div className="rounded-xl border border-[#231f32] bg-[#141120] p-5 shadow-sm space-y-3">
						<div>
							<h4 className="text-sm font-semibold text-[#eae6f4]">
								Build-time Arguments
							</h4>
							<p className="text-xs text-[#8a8597]">
								Arguments passed during Docker build phase (ARG).
							</p>
						</div>
						<div className="rounded-lg border border-[#2b273c] bg-[#161322] p-1 font-mono text-xs">
							<CodeEditor
								value={buildArgs}
								onChange={setBuildArgs}
								language="properties"
								readOnly={!canWrite}
								completionSource={completionSource}
								lineWrapping
								wrapperClassName="min-h-[140px] font-mono text-xs"
								placeholder="NPM_TOKEN=xyz"
							/>
						</div>
					</div>

					<div className="rounded-xl border border-[#231f32] bg-[#141120] p-5 shadow-sm space-y-3">
						<div>
							<h4 className="text-sm font-semibold text-[#eae6f4]">
								Build-time Secrets
							</h4>
							<p className="text-xs text-[#8a8597]">
								Mounted securely during Docker build phase.
							</p>
						</div>
						<div className="rounded-lg border border-[#2b273c] bg-[#161322] p-1 font-mono text-xs">
							<CodeEditor
								value={buildSecrets}
								onChange={setBuildSecrets}
								language="properties"
								readOnly={!canWrite}
								completionSource={completionSource}
								lineWrapping
								wrapperClassName="min-h-[140px] font-mono text-xs"
								placeholder="SECRET_TOKEN=xyz"
							/>
						</div>
					</div>
				</div>
			)}

			{/* Create .env file toggle */}
			{(isApplication || isCompose) && (
				<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#231f32] bg-[#141120] p-5 shadow-sm">
					<div>
						<h4 className="text-sm font-semibold text-[#eae6f4]">
							Create .env File in Container
						</h4>
						<p className="text-xs text-[#898596] max-w-xl">
							When enabled,Dokploy automatically generates an .env file
							containing these variables inside the working directory on deploy.
						</p>
					</div>
					<Switch
						checked={createEnvFile}
						onCheckedChange={setCreateEnvFile}
						disabled={!canWrite}
					/>
				</div>
			)}

			{/* Save Actions Bar */}
			{canWrite && (
				<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#231f32] bg-[#141120] p-4 shadow-md">
					<div className="flex items-center gap-2 text-xs">
						{hasChanges ? (
							<span className="flex items-center gap-1.5 font-medium text-amber-400">
								<span className="size-2 rounded-full bg-amber-400 animate-pulse" />
								You have unsaved changes
							</span>
						) : (
							<span className="flex items-center gap-1.5 text-[#7e7a8e]">
								<span className="size-2 rounded-full bg-emerald-400" />
								All changes saved
							</span>
						)}
					</div>

					<div className="flex items-center gap-2">
						{hasChanges && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleDiscard}
								disabled={isSaving}
								className="h-8 border-[#2b273c] bg-[#161322] text-xs text-[#c0bccf] hover:bg-white/[0.08] hover:text-white"
							>
								Discard
							</Button>
						)}

						<Button
							type="button"
							size="sm"
							onClick={handleSave}
							disabled={!hasChanges || isSaving}
							className="h-8 gap-1.5 border border-violet-400/30 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-xs font-semibold text-white shadow-md shadow-violet-900/30 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50"
						>
							{isSaving && <Loader2 className="size-3.5 animate-spin" />}
							<span>Save Variables</span>
						</Button>
					</div>
				</div>
			)}
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/*                              3. METRICS TAB                                */
/* -------------------------------------------------------------------------- */

export type MetricsTimeFilter = "1h" | "6h" | "24h" | "7d";

const defaultDockerStats: DockerStats = {
	cpu: { value: "0%", time: "" },
	memory: { value: { used: 0, total: 0 }, time: "" },
	block: { value: { readMb: 0, writeMb: 0 }, time: "" },
	network: { value: { inputMb: 0, outputMb: 0 }, time: "" },
	disk: {
		value: { diskTotal: 0, diskUsage: 0, diskUsedPercentage: 0, diskFree: 0 },
		time: "",
	},
};

const RailwayMetricsTab = ({ service }: { service: RailwayService }) => {
	const isCompose = service.type === "compose";
	const runtimeAppName = service.appName || service.name;
	const serverId = service.serverId || undefined;

	const [timeFilter, setTimeFilter] = useState<MetricsTimeFilter>("1h");
	const [activeContainerAppName, setActiveContainerAppName] = useState<string>(
		runtimeAppName || "",
	);

	// Multi-container selector for compose stacks
	const { data: composeContainers, isPending: isLoadingContainers } =
		api.docker.getContainersByAppNameMatch.useQuery(
			{
				appName: runtimeAppName || "",
				appType: isCompose
					? service.composeType || "docker-compose"
					: undefined,
				serverId,
			},
			{ enabled: !!runtimeAppName && isCompose },
		);

	useEffect(() => {
		if (
			isCompose &&
			composeContainers &&
			composeContainers.length > 0 &&
			!activeContainerAppName
		) {
			setActiveContainerAppName(composeContainers[0]?.name || "");
		}
	}, [isCompose, composeContainers, activeContainerAppName]);

	const targetAppName = isCompose
		? activeContainerAppName || runtimeAppName
		: runtimeAppName;

	// Initial monitoring query
	const { data: monitoringData } = api.application.readAppMonitoring.useQuery(
		{ appName: targetAppName },
		{ enabled: !!targetAppName, refetchOnWindowFocus: false },
	);

	const [currentData, setCurrentData] =
		useState<DockerStats>(defaultDockerStats);
	const [accumulativeData, setAccumulativeData] = useState<DockerStatsJSON>({
		cpu: [],
		memory: [],
		block: [],
		network: [],
		disk: [],
	});

	// Reset when target container changes
	useEffect(() => {
		setCurrentData(defaultDockerStats);
		setAccumulativeData({
			cpu: [],
			memory: [],
			block: [],
			network: [],
			disk: [],
		});
	}, [targetAppName]);

	// Update when query data changes
	useEffect(() => {
		if (!monitoringData) return;
		setCurrentData({
			cpu: monitoringData.cpu[monitoringData.cpu.length - 1] ?? currentData.cpu,
			memory:
				monitoringData.memory[monitoringData.memory.length - 1] ??
				currentData.memory,
			block:
				monitoringData.block[monitoringData.block.length - 1] ??
				currentData.block,
			network:
				monitoringData.network[monitoringData.network.length - 1] ??
				currentData.network,
			disk:
				monitoringData.disk[monitoringData.disk.length - 1] ?? currentData.disk,
		});
		setAccumulativeData({
			cpu: monitoringData.cpu || [],
			memory: monitoringData.memory || [],
			block: monitoringData.block || [],
			network: monitoringData.network || [],
			disk: monitoringData.disk || [],
		});
	}, [monitoringData]);

	// WebSocket for real-time live telemetry stream
	useEffect(() => {
		if (!targetAppName) return;
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const appTypeParam = isCompose ? "docker-compose" : "application";
		const wsUrl = `${protocol}//${window.location.host}/config/listen-docker-stats-monitoring?appName=${targetAppName}&appType=${appTypeParam}`;
		const ws = new WebSocket(wsUrl);

		ws.onmessage = (e) => {
			try {
				const value = JSON.parse(e.data);
				if (!value?.data) return;

				const nextData: DockerStats = {
					cpu: value.data.cpu ?? currentData.cpu,
					memory: value.data.memory ?? currentData.memory,
					block: value.data.block ?? currentData.block,
					disk: value.data.disk ?? currentData.disk,
					network: value.data.network ?? currentData.network,
				};

				setCurrentData(nextData);

				const MAX_DATA_POINTS =
					timeFilter === "1h"
						? 120
						: timeFilter === "6h"
							? 240
							: timeFilter === "24h"
								? 360
								: 500;

				setAccumulativeData((prev) => ({
					cpu: [...prev.cpu, nextData.cpu].slice(-MAX_DATA_POINTS),
					memory: [...prev.memory, nextData.memory].slice(-MAX_DATA_POINTS),
					block: [...prev.block, nextData.block].slice(-MAX_DATA_POINTS),
					network: [...prev.network, nextData.network].slice(-MAX_DATA_POINTS),
					disk: [...prev.disk, nextData.disk].slice(-MAX_DATA_POINTS),
				}));
			} catch (err) {
				console.error("Metrics WS error parsing:", err);
			}
		};

		return () => {
			if (
				ws.readyState === WebSocket.OPEN ||
				ws.readyState === WebSocket.CONNECTING
			) {
				ws.close();
			}
		};
	}, [targetAppName, isCompose, timeFilter]);

	// Memory calculations
	const memUsedBytes = convertMemoryToBytes(
		String(currentData.memory.value.used),
	);
	const memTotalBytes = convertMemoryToBytes(
		String(currentData.memory.value.total),
	);
	const memPercentage =
		memTotalBytes > 0
			? Math.min(100, Math.round((memUsedBytes / memTotalBytes) * 100))
			: 0;
	const memLimitGB = memTotalBytes > 0 ? memTotalBytes / 1024 ** 3 : 1;

	// CPU calculations
	const cpuValueStr = String(currentData.cpu.value ?? "0%");
	const cpuNumeric = Number.parseFloat(cpuValueStr.replace("%", "")) || 0;

	return (
		<div className="space-y-6">
			{/* Top Header: Time Filter & Container Selector */}
			<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#231f32] bg-[#141120] p-4 shadow-sm">
				{/* Left container selector or status */}
				<div className="flex flex-wrap items-center gap-3">
					{isCompose && (
						<div className="flex items-center gap-2">
							<SquareTerminal className="size-4 text-[#8a8597]" />
							<Select
								value={activeContainerAppName}
								onValueChange={setActiveContainerAppName}
							>
								<SelectTrigger className="h-8 min-w-[200px] border-[#2b273c] bg-[#161322] text-xs font-mono text-[#dcd7e8]">
									{isLoadingContainers ? (
										<span className="flex items-center gap-1.5">
											<Loader2 className="size-3 animate-spin text-violet-400" />
											Loading containers...
										</span>
									) : (
										<SelectValue placeholder="Select container" />
									)}
								</SelectTrigger>
								<SelectContent className="border-[#322e42] bg-[#161422] text-xs text-[#eae6f4]">
									<SelectGroup>
										{composeContainers?.map((c) => (
											<SelectItem
												key={c.containerId}
												value={c.name}
												className="font-mono text-xs"
											>
												{c.name} ({c.containerId.slice(0, 8)})
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="flex items-center gap-2">
						<span className="size-2 rounded-full bg-emerald-400 animate-pulse ring-4 ring-emerald-400/20" />
						<span className="text-xs font-medium text-[#b3afc1]">
							Live Telemetry Active
						</span>
					</div>
				</div>

				{/* Right: Time Range Pills */}
				<div className="flex items-center gap-1 rounded-lg border border-[#2b273c] bg-[#161322] p-1">
					{(["1h", "6h", "24h", "7d"] as MetricsTimeFilter[]).map((tf) => (
						<button
							key={tf}
							type="button"
							onClick={() => setTimeFilter(tf)}
							className={cn(
								"rounded-md px-2.5 py-1 text-xs font-medium transition-all",
								timeFilter === tf
									? "bg-violet-600/25 text-violet-200 border border-violet-500/40 shadow-xs"
									: "text-[#878395] hover:text-[#e4e1ed] border border-transparent",
							)}
						>
							{tf}
						</button>
					))}
				</div>
			</div>

			{/* 2x2 Responsive Metrics Grid */}
			<div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
				{/* 1. CPU USAGE CARD */}
				<div className="rounded-xl border border-[#231f32] bg-[#141120] p-5 shadow-sm space-y-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2.5">
							<div className="flex size-8 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-400">
								<Cpu className="size-4" />
							</div>
							<div>
								<h3 className="text-sm font-semibold text-[#eeeaf6]">
									CPU Usage
								</h3>
								<p className="text-[11px] text-[#7f7a8c]">
									Core compute utilization
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span className="font-mono text-base font-bold text-white">
								{cpuValueStr}
							</span>
						</div>
					</div>

					<Progress value={cpuNumeric} className="h-1.5 bg-[#201d2d]" />

					<div className="h-44 w-full">
						<DockerCpuChart accumulativeData={accumulativeData.cpu} />
					</div>

					<div className="flex items-center justify-between border-t border-[#231f32]/60 pt-3 text-[11px] text-[#7e7a8d]">
						<span>Timeframe: Last {timeFilter}</span>
						<span>Data points: {accumulativeData.cpu.length}</span>
					</div>
				</div>

				{/* 2. MEMORY USAGE CARD */}
				<div className="rounded-xl border border-[#231f32] bg-[#141120] p-5 shadow-sm space-y-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2.5">
							<div className="flex size-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
								<Activity className="size-4" />
							</div>
							<div>
								<h3 className="text-sm font-semibold text-[#eeeaf6]">
									Memory Usage
								</h3>
								<p className="text-[11px] text-[#7f7a8c]">
									Resident RAM allocation
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span className="font-mono text-xs text-[#a5a1b3]">
								{String(currentData.memory.value.used || "0 MB")} /{" "}
								{String(currentData.memory.value.total || "Limit")}
							</span>
							<Badge
								variant="outline"
								className="border-indigo-500/30 bg-indigo-500/10 font-mono text-[10px] text-indigo-300"
							>
								{memPercentage}%
							</Badge>
						</div>
					</div>

					<Progress value={memPercentage} className="h-1.5 bg-[#201d2d]" />

					<div className="h-44 w-full">
						<DockerMemoryChart
							accumulativeData={accumulativeData.memory}
							memoryLimitGB={memLimitGB}
						/>
					</div>

					<div className="flex items-center justify-between border-t border-[#231f32]/60 pt-3 text-[11px] text-[#7e7a8d]">
						<span>Memory Limit: {memLimitGB.toFixed(2)} GB</span>
						<span>Data points: {accumulativeData.memory.length}</span>
					</div>
				</div>

				{/* 3. NETWORK I/O CARD */}
				<div className="rounded-xl border border-[#231f32] bg-[#141120] p-5 shadow-sm space-y-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2.5">
							<div className="flex size-8 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
								<Wifi className="size-4" />
							</div>
							<div>
								<h3 className="text-sm font-semibold text-[#eeeaf6]">
									Network I/O
								</h3>
								<p className="text-[11px] text-[#7f7a8c]">
									Inbound & outbound traffic
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3 font-mono text-xs">
							<span className="text-sky-400">
								In: {formatMb(currentData.network.value.inputMb)}
							</span>
							<span className="text-[#676375]">|</span>
							<span className="text-violet-400">
								Out: {formatMb(currentData.network.value.outputMb)}
							</span>
						</div>
					</div>

					<div className="h-48 w-full">
						<DockerNetworkChart accumulativeData={accumulativeData.network} />
					</div>

					<div className="flex items-center justify-between border-t border-[#231f32]/60 pt-3 text-[11px] text-[#7e7a8d]">
						<span>Real-time transfer rate</span>
						<span>Data points: {accumulativeData.network.length}</span>
					</div>
				</div>

				{/* 4. DISK / STORAGE & BLOCK I/O CARD */}
				<div className="rounded-xl border border-[#231f32] bg-[#141120] p-5 shadow-sm space-y-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2.5">
							<div className="flex size-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
								<HardDrive className="size-4" />
							</div>
							<div>
								<h3 className="text-sm font-semibold text-[#eeeaf6]">
									Disk & Block I/O
								</h3>
								<p className="text-[11px] text-[#7f7a8c]">
									Storage throughput & disk operations
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3 font-mono text-xs">
							<span className="text-amber-400">
								Read: {formatMb(currentData.block.value.readMb)}
							</span>
							<span className="text-[#676375]">|</span>
							<span className="text-emerald-400">
								Write: {formatMb(currentData.block.value.writeMb)}
							</span>
						</div>
					</div>

					<div className="h-48 w-full">
						{service.name === "dokploy" &&
						currentData.disk.value.diskTotal > 0 ? (
							<DockerDiskChart
								accumulativeData={accumulativeData.disk}
								diskTotal={currentData.disk.value.diskTotal}
							/>
						) : (
							<DockerBlockChart accumulativeData={accumulativeData.block} />
						)}
					</div>

					<div className="flex items-center justify-between border-t border-[#231f32]/60 pt-3 text-[11px] text-[#7e7a8d]">
						<span>Block storage device operations</span>
						<span>Data points: {accumulativeData.block.length}</span>
					</div>
				</div>
			</div>
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/*                              4. CONSOLE TAB                                */
/* -------------------------------------------------------------------------- */

const RailwayConsoleTab = ({ service }: { service: RailwayService }) => {
	const terminalId = `railway-term-${useId().replace(/:/g, "")}`;
	const runtimeAppName = service.appName || service.name;
	const serverId = service.serverId || undefined;

	const { data, isPending, refetch } =
		api.docker.getContainersByAppNameMatch.useQuery(
			{
				appName: runtimeAppName || "",
				serverId,
				appType:
					service.type === "compose"
						? service.composeType || "docker-compose"
						: undefined,
			},
			{ enabled: !!runtimeAppName },
		);

	const [containerId, setContainerId] = useState<string>();

	useEffect(() => {
		if (data && data.length > 0) {
			const exists = data.some((c) => c.containerId === containerId);
			if (!exists || !containerId) {
				setContainerId(data[0]?.containerId);
			}
		} else {
			setContainerId(undefined);
		}
	}, [data, containerId]);

	return (
		<div className="space-y-4">
			{/* Console Header & Container Selector */}
			<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#231f32] bg-[#141120] p-4 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex size-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-400">
						<SquareTerminal className="size-4" />
					</div>
					<div>
						<p className="text-xs text-[#827e8f]">Active Container TTY</p>
						<p className="font-mono text-sm font-medium text-[#eae6f4]">
							{containerId?.slice(0, 12) || "No container selected"}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<Select value={containerId} onValueChange={setContainerId}>
						<SelectTrigger className="h-9 min-w-[220px] max-w-[360px] border-[#2b273c] bg-[#161322] text-xs font-mono text-[#dcd8e6]">
							{isPending ? (
								<span className="flex items-center gap-2">
									<Loader2 className="size-3.5 animate-spin text-violet-400" />
									Loading containers...
								</span>
							) : (
								<SelectValue placeholder="Select container" />
							)}
						</SelectTrigger>
						<SelectContent className="border-[#322e42] bg-[#161422] text-xs text-[#eae6f4]">
							<SelectGroup>
								{data?.map((container) => (
									<SelectItem
										key={container.containerId}
										value={container.containerId}
										className="font-mono text-xs focus:bg-white/[0.07]"
									>
										{container.name} ({container.containerId.slice(0, 10)})
										<Badge
											className="ml-2 text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
											variant="outline"
										>
											{container.state}
										</Badge>
									</SelectItem>
								))}
								<SelectLabel className="text-[11px] text-[#6e6a7c]">
									Containers ({data?.length || 0})
								</SelectLabel>
							</SelectGroup>
						</SelectContent>
					</Select>

					<Button
						variant="ghost"
						size="icon"
						className="size-9 border border-[#2b273c] bg-[#161322] text-[#9b97a7] hover:bg-white/[0.08] hover:text-white"
						onClick={() => {
							refetch();
							toast.info("Refreshed container list");
						}}
						title="Refresh container list"
					>
						<RotateCcw
							className={cn("size-3.5", isPending && "animate-spin")}
						/>
					</Button>
				</div>
			</div>

			{/* Terminal Frame */}
			<div className="min-h-[500px] rounded-xl border border-[#231f32] bg-[#0c0a14] p-3 shadow-2xl overflow-hidden">
				<DockerTerminal
					id={terminalId}
					containerId={containerId || "select-a-container"}
					serverId={service.serverId || ""}
					serviceId={service.id}
				/>
			</div>
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/*                             5. SETTINGS TAB                                */
/* -------------------------------------------------------------------------- */

const SettingsSection = ({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) => (
	<div className="space-y-4">
		<div>
			<h3 className="text-base font-semibold text-white">{title}</h3>
			{description && <p className="text-xs text-[#8f8a9a]">{description}</p>}
		</div>
		{children}
	</div>
);

const RailwaySettingsTab = ({
	service,
	projectId: _projectId,
	environmentId: _environmentId,
}: {
	service: RailwayService;
	projectId: string;
	environmentId: string;
}) => {
	const isApplication = service.type === "application";
	const isCompose = service.type === "compose";
	const { data: permissions } = api.user.getPermissions.useQuery();
	// Advanced infrastructure settings follow the same gate as the full service
	// page, where they are only rendered for members who can create services.
	const canManageAdvanced = permissions?.service.create ?? false;

	return (
		<div className="space-y-8">
			{isApplication ? (
				<>
					{/* Source & Build */}
					<ShowGeneralApplication applicationId={service.id} />

					{/* Service icon */}
					<ShowIconSettings
						serviceId={service.id}
						serviceType="application"
						icon={service.icon}
					/>

					{/* Networking */}
					<SettingsSection
						title="Networking"
						description="Domains, exposed ports, redirects and security rules."
					>
						<ShowDomains id={service.id} type="application" />
						{canManageAdvanced && (
							<>
								<ShowPorts applicationId={service.id} />
								<ShowRedirects applicationId={service.id} />
								<ShowSecurity applicationId={service.id} />
								<ShowTraefikConfig applicationId={service.id} />
							</>
						)}
					</SettingsSection>

					{/* Deploy */}
					{canManageAdvanced && (
						<SettingsSection
							title="Deploy"
							description="Start command, replicas, resources, storage and networks."
						>
							<AddCommand applicationId={service.id} />
							<ShowClusterSettings id={service.id} type="application" />
							<ShowBuildServer applicationId={service.id} />
							<ShowResources id={service.id} type="application" />
							<ShowVolumes id={service.id} type="application" />
							<AssignNetworks id={service.id} type="application" />
						</SettingsSection>
					)}

					{/* Preview deployments */}
					<SettingsSection
						title="Preview Deployments"
						description="Deploy a temporary environment for every pull request."
					>
						<ShowPreviewDeployments applicationId={service.id} />
					</SettingsSection>

					{/* Rollbacks */}
					<SettingsSection
						title="Rollbacks"
						description="Keep previous images so a deployment can be rolled back."
					>
						<ShowRollbackSettings applicationId={service.id} />
					</SettingsSection>

					{/* Scheduled Jobs */}
					<SettingsSection title="Scheduled Jobs">
						<ShowSchedules id={service.id} scheduleType="application" />
					</SettingsSection>

					{/* Volume backups */}
					<SettingsSection title="Volume Backups">
						<ShowVolumeBackups
							id={service.id}
							type="application"
							serverId={service.serverId || undefined}
						/>
					</SettingsSection>

					{/* Patches */}
					<SettingsSection
						title="Patches"
						description="Files applied to the source before every build."
					>
						<ShowPatches id={service.id} type="application" />
					</SettingsSection>

					{/* Danger Zone */}
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5">
						<div>
							<h4 className="font-semibold text-rose-400">Danger Zone</h4>
							<p className="text-xs text-[#8f8a9a]">
								Permanently delete this application and all associated
								resources.
							</p>
						</div>
						<DeleteService id={service.id} type="application" />
					</div>
				</>
			) : isCompose ? (
				<>
					{/* Source & Compose file */}
					<ShowGeneralCompose composeId={service.id} />

					{/* Service icon */}
					<ShowIconSettings
						serviceId={service.id}
						serviceType="compose"
						icon={service.icon}
					/>

					{/* Networking */}
					<SettingsSection title="Networking">
						<ShowDomains id={service.id} type="compose" />
						{canManageAdvanced && (
							<AssignComposeNetworks composeId={service.id} />
						)}
					</SettingsSection>

					{/* Deploy */}
					{canManageAdvanced && (
						<SettingsSection
							title="Deploy"
							description="Compose command, storage, imports and isolation."
						>
							<AddCommandCompose composeId={service.id} />
							<ShowVolumes id={service.id} type="compose" />
							<ShowImport composeId={service.id} />
							<IsolatedDeploymentTab composeId={service.id} />
						</SettingsSection>
					)}

					{/* Backups */}
					<SettingsSection title="Backups">
						<ShowBackups id={service.id} backupType="compose" />
						<ShowDestinations />
					</SettingsSection>

					{/* Scheduled Jobs */}
					<SettingsSection title="Scheduled Jobs">
						<ShowSchedules id={service.id} scheduleType="compose" />
					</SettingsSection>

					{/* Volume backups */}
					<SettingsSection title="Volume Backups">
						<ShowVolumeBackups
							id={service.id}
							type="compose"
							serverId={service.serverId || undefined}
						/>
					</SettingsSection>

					{/* Patches */}
					<SettingsSection
						title="Patches"
						description="Files applied to the source before every deployment."
					>
						<ShowPatches id={service.id} type="compose" />
					</SettingsSection>

					{/* Danger Zone */}
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5">
						<div>
							<h4 className="font-semibold text-rose-400">Danger Zone</h4>
							<p className="text-xs text-[#8f8a9a]">
								Permanently delete this compose stack and associated containers.
							</p>
						</div>
						<DeleteService id={service.id} type="compose" />
					</div>
				</>
			) : service.type === "postgres" ? (
				<>
					<ShowGeneralPostgres postgresId={service.id} />
					<ShowInternalPostgresCredentials postgresId={service.id} />
					<ShowExternalPostgresCredentials postgresId={service.id} />
					<div className="space-y-4">
						<h3 className="text-base font-semibold text-white">
							Database Backups
						</h3>
						<ShowBackups
							id={service.id}
							databaseType="postgres"
							backupType="database"
						/>
						<ShowDestinations />
					</div>
					<ShowDatabaseAdvancedSettings id={service.id} type="postgres" />
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5">
						<div>
							<h4 className="font-semibold text-rose-400">Danger Zone</h4>
							<p className="text-xs text-[#8f8a9a]">
								Permanently delete this PostgreSQL database and its data.
							</p>
						</div>
						<DeleteService id={service.id} type="postgres" />
					</div>
				</>
			) : service.type === "mysql" ? (
				<>
					<ShowGeneralMysql mysqlId={service.id} />
					<ShowInternalMysqlCredentials mysqlId={service.id} />
					<ShowExternalMysqlCredentials mysqlId={service.id} />
					<div className="space-y-4">
						<h3 className="text-base font-semibold text-white">
							Database Backups
						</h3>
						<ShowBackups
							id={service.id}
							databaseType="mysql"
							backupType="database"
						/>
						<ShowDestinations />
					</div>
					<ShowDatabaseAdvancedSettings id={service.id} type="mysql" />
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5">
						<div>
							<h4 className="font-semibold text-rose-400">Danger Zone</h4>
							<p className="text-xs text-[#8f8a9a]">
								Permanently delete this MySQL database and its data.
							</p>
						</div>
						<DeleteService id={service.id} type="mysql" />
					</div>
				</>
			) : service.type === "mariadb" ? (
				<>
					<ShowGeneralMariadb mariadbId={service.id} />
					<ShowInternalMariadbCredentials mariadbId={service.id} />
					<ShowExternalMariadbCredentials mariadbId={service.id} />
					<div className="space-y-4">
						<h3 className="text-base font-semibold text-white">
							Database Backups
						</h3>
						<ShowBackups
							id={service.id}
							databaseType="mariadb"
							backupType="database"
						/>
						<ShowDestinations />
					</div>
					<ShowDatabaseAdvancedSettings id={service.id} type="mariadb" />
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5">
						<div>
							<h4 className="font-semibold text-rose-400">Danger Zone</h4>
							<p className="text-xs text-[#8f8a9a]">
								Permanently delete this MariaDB database and its data.
							</p>
						</div>
						<DeleteService id={service.id} type="mariadb" />
					</div>
				</>
			) : service.type === "mongo" ? (
				<>
					<ShowGeneralMongo mongoId={service.id} />
					<ShowInternalMongoCredentials mongoId={service.id} />
					<ShowExternalMongoCredentials mongoId={service.id} />
					<div className="space-y-4">
						<h3 className="text-base font-semibold text-white">
							Database Backups
						</h3>
						<ShowBackups
							id={service.id}
							databaseType="mongo"
							backupType="database"
						/>
						<ShowDestinations />
					</div>
					<ShowDatabaseAdvancedSettings id={service.id} type="mongo" />
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5">
						<div>
							<h4 className="font-semibold text-rose-400">Danger Zone</h4>
							<p className="text-xs text-[#8f8a9a]">
								Permanently delete this MongoDB database and its data.
							</p>
						</div>
						<DeleteService id={service.id} type="mongo" />
					</div>
				</>
			) : service.type === "redis" ? (
				<>
					<ShowGeneralRedis redisId={service.id} />
					<ShowInternalRedisCredentials redisId={service.id} />
					<ShowExternalRedisCredentials redisId={service.id} />
					<ShowDatabaseAdvancedSettings id={service.id} type="redis" />
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5">
						<div>
							<h4 className="font-semibold text-rose-400">Danger Zone</h4>
							<p className="text-xs text-[#8f8a9a]">
								Permanently delete this Redis service.
							</p>
						</div>
						<DeleteService id={service.id} type="redis" />
					</div>
				</>
			) : service.type === "libsql" ? (
				<>
					<ShowGeneralLibsql libsqlId={service.id} />
					<ShowInternalLibsqlCredentials libsqlId={service.id} />
					<ShowExternalLibsqlCredentials libsqlId={service.id} />
					<div className="space-y-4">
						<h3 className="text-base font-semibold text-white">
							Database Backups
						</h3>
						<ShowBackups
							id={service.id}
							databaseType="libsql"
							backupType="database"
						/>
						<ShowDestinations />
					</div>
					<ShowDatabaseAdvancedSettings id={service.id} type="libsql" />
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-5">
						<div>
							<h4 className="font-semibold text-rose-400">Danger Zone</h4>
							<p className="text-xs text-[#8f8a9a]">
								Permanently delete this LibSQL database and its data.
							</p>
						</div>
						<DeleteService id={service.id} type="libsql" />
					</div>
				</>
			) : null}
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/*                        MAIN RAILWAY SERVICE PANEL                          */
/* -------------------------------------------------------------------------- */

export const RailwayServicePanel = ({
	service,
	projectId,
	environmentId,
	initialTab,
	activeTab: controlledActiveTab,
	onTabChange,
	onClose,
	onRemove,
}: Props) => {
	const isApplication = service.type === "application";
	const isCompose = service.type === "compose";
	const isDeployable = isApplication || isCompose;
	const serviceHref = `/dashboard/project/${projectId}/environment/${environmentId}/services/${service.type}/${service.id}`;

	const { data: permissions } = api.user.getPermissions.useQuery();
	const canDeploy = permissions?.deployment.create ?? true;

	const [internalTab, setInternalTab] = useState<PanelTab>(() => {
		if (initialTab && PANEL_TABS.some((t) => t.id === initialTab)) {
			return initialTab;
		}
		return "deployments";
	});

	const currentTab = controlledActiveTab ?? internalTab;

	const handleSelectTab = (tab: PanelTab) => {
		if (onTabChange) {
			onTabChange(tab);
		}
		setInternalTab(tab);
	};

	// Sync tab when initialTab or service changes
	useEffect(() => {
		if (initialTab && PANEL_TABS.some((t) => t.id === initialTab)) {
			setInternalTab(initialTab);
		}
	}, [initialTab]);

	// Close on Escape key
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	// Primary domain lookup for quick Open App access
	const { data: appDomains } = api.domain.byApplicationId.useQuery(
		{ applicationId: service.id },
		{ enabled: isApplication },
	);
	const { data: composeDomains } = api.domain.byComposeId.useQuery(
		{ composeId: service.id },
		{ enabled: isCompose },
	);
	const domains = isApplication ? appDomains : composeDomains;
	const primaryDomain = domains?.find((d) => d.enabled) || domains?.[0];
	const domainUrl = primaryDomain
		? `${primaryDomain.https ? "https" : "http"}://${primaryDomain.host}${primaryDomain.path || ""}`
		: null;

	// Mutations for Quick Toolbar Actions
	const utils = api.useUtils();
	const { mutateAsync: appStart, isPending: isStartingApp } =
		api.application.start.useMutation();
	const { mutateAsync: appStop, isPending: isStoppingApp } =
		api.application.stop.useMutation();
	const { mutateAsync: appReload, isPending: isReloadingApp } =
		api.application.reload.useMutation();
	const { mutateAsync: appDeploy, isPending: isDeployingApp } =
		api.application.deploy.useMutation();
	const { mutateAsync: appRedeploy, isPending: isRedeployingApp } =
		api.application.redeploy.useMutation();

	const { mutateAsync: composeStart, isPending: isStartingCompose } =
		api.compose.start.useMutation();
	const { mutateAsync: composeStop, isPending: isStoppingCompose } =
		api.compose.stop.useMutation();
	const { mutateAsync: composeDeploy, isPending: isDeployingCompose } =
		api.compose.deploy.useMutation();
	const { mutateAsync: composeRedeploy, isPending: isRedeployingCompose } =
		api.compose.redeploy.useMutation();

	const { mutateAsync: postgresReload, isPending: isReloadingPostgres } =
		api.postgres.reload.useMutation();
	const { mutateAsync: postgresStart, isPending: isStartingPostgres } =
		api.postgres.start.useMutation();
	const { mutateAsync: postgresStop, isPending: isStoppingPostgres } =
		api.postgres.stop.useMutation();

	const { mutateAsync: mysqlReload, isPending: isReloadingMysql } =
		api.mysql.reload.useMutation();
	const { mutateAsync: mysqlStart, isPending: isStartingMysql } =
		api.mysql.start.useMutation();
	const { mutateAsync: mysqlStop, isPending: isStoppingMysql } =
		api.mysql.stop.useMutation();

	const { mutateAsync: mariadbReload, isPending: isReloadingMariadb } =
		api.mariadb.reload.useMutation();
	const { mutateAsync: mariadbStart, isPending: isStartingMariadb } =
		api.mariadb.start.useMutation();
	const { mutateAsync: mariadbStop, isPending: isStoppingMariadb } =
		api.mariadb.stop.useMutation();

	const { mutateAsync: mongoReload, isPending: isReloadingMongo } =
		api.mongo.reload.useMutation();
	const { mutateAsync: mongoStart, isPending: isStartingMongo } =
		api.mongo.start.useMutation();
	const { mutateAsync: mongoStop, isPending: isStoppingMongo } =
		api.mongo.stop.useMutation();

	const { mutateAsync: redisReload, isPending: isReloadingRedis } =
		api.redis.reload.useMutation();
	const { mutateAsync: redisStart, isPending: isStartingRedis } =
		api.redis.start.useMutation();
	const { mutateAsync: redisStop, isPending: isStoppingRedis } =
		api.redis.stop.useMutation();

	const { mutateAsync: libsqlReload, isPending: isReloadingLibsql } =
		api.libsql.reload.useMutation();
	const { mutateAsync: libsqlStart, isPending: isStartingLibsql } =
		api.libsql.start.useMutation();
	const { mutateAsync: libsqlStop, isPending: isStoppingLibsql } =
		api.libsql.stop.useMutation();

	const isActionLoading =
		isStartingApp ||
		isStoppingApp ||
		isReloadingApp ||
		isDeployingApp ||
		isRedeployingApp ||
		isStartingCompose ||
		isStoppingCompose ||
		isDeployingCompose ||
		isRedeployingCompose ||
		isReloadingPostgres ||
		isStartingPostgres ||
		isStoppingPostgres ||
		isReloadingMysql ||
		isStartingMysql ||
		isStoppingMysql ||
		isReloadingMariadb ||
		isStartingMariadb ||
		isStoppingMariadb ||
		isReloadingMongo ||
		isStartingMongo ||
		isStoppingMongo ||
		isReloadingRedis ||
		isStartingRedis ||
		isStoppingRedis ||
		isReloadingLibsql ||
		isStartingLibsql ||
		isStoppingLibsql;

	const handleQuickRestart = async () => {
		try {
			if (isApplication) {
				await appReload({
					applicationId: service.id,
					appName: service.appName || "",
				});
				toast.success("Application restarted");
			} else if (isCompose) {
				await composeRedeploy({ composeId: service.id });
				toast.success("Compose stack redeployed");
			} else if (service.type === "postgres") {
				await postgresReload({
					postgresId: service.id,
					appName: service.appName || "",
				});
				toast.success("PostgreSQL restarted");
			} else if (service.type === "mysql") {
				await mysqlReload({
					mysqlId: service.id,
					appName: service.appName || "",
				});
				toast.success("MySQL restarted");
			} else if (service.type === "mariadb") {
				await mariadbReload({
					mariadbId: service.id,
					appName: service.appName || "",
				});
				toast.success("MariaDB restarted");
			} else if (service.type === "mongo") {
				await mongoReload({
					mongoId: service.id,
					appName: service.appName || "",
				});
				toast.success("MongoDB restarted");
			} else if (service.type === "redis") {
				await redisReload({
					redisId: service.id,
					appName: service.appName || "",
				});
				toast.success("Redis restarted");
			} else if (service.type === "libsql") {
				await libsqlReload({
					libsqlId: service.id,
					appName: service.appName || "",
				});
				toast.success("LibSQL restarted");
			}
			await Promise.all([
				utils.project.one.invalidate(),
				utils.project.all.invalidate(),
				utils.project.runtimeStatus.invalidate(),
			]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to restart service",
			);
		}
	};

	const handleQuickRedeploy = async () => {
		try {
			if (isApplication) {
				await appRedeploy({ applicationId: service.id });
				toast.success("Application redeployment triggered");
			} else if (isCompose) {
				await composeRedeploy({ composeId: service.id });
				toast.success("Compose redeployment triggered");
			}
			handleSelectTab("deployments");
			await Promise.all([
				utils.project.one.invalidate(),
				utils.project.all.invalidate(),
				utils.project.runtimeStatus.invalidate(),
			]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to redeploy service",
			);
		}
	};

	const handleQuickDeploy = async () => {
		try {
			if (isApplication) {
				await appDeploy({ applicationId: service.id });
				toast.success("Deployment triggered");
				handleSelectTab("deployments");
			} else if (isCompose) {
				await composeDeploy({ composeId: service.id });
				toast.success("Compose deployment triggered");
				handleSelectTab("deployments");
			}
			await Promise.all([
				utils.project.one.invalidate(),
				utils.project.all.invalidate(),
				utils.project.runtimeStatus.invalidate(),
			]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to deploy service",
			);
		}
	};

	const handleQuickStart = async () => {
		try {
			if (isApplication) {
				await appStart({ applicationId: service.id });
				toast.success("Application started");
			} else if (isCompose) {
				await composeStart({ composeId: service.id });
				toast.success("Compose stack started");
			} else if (service.type === "postgres") {
				await postgresStart({ postgresId: service.id });
				toast.success("PostgreSQL started");
			} else if (service.type === "mysql") {
				await mysqlStart({ mysqlId: service.id });
				toast.success("MySQL started");
			} else if (service.type === "mariadb") {
				await mariadbStart({ mariadbId: service.id });
				toast.success("MariaDB started");
			} else if (service.type === "mongo") {
				await mongoStart({ mongoId: service.id });
				toast.success("MongoDB started");
			} else if (service.type === "redis") {
				await redisStart({ redisId: service.id });
				toast.success("Redis started");
			} else if (service.type === "libsql") {
				await libsqlStart({ libsqlId: service.id });
				toast.success("LibSQL started");
			}
			await Promise.all([
				utils.project.one.invalidate(),
				utils.project.all.invalidate(),
				utils.project.runtimeStatus.invalidate(),
			]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to start service",
			);
		}
	};

	const handleQuickStop = async () => {
		try {
			if (isApplication) {
				await appStop({ applicationId: service.id });
				toast.success("Application stopped");
			} else if (isCompose) {
				await composeStop({ composeId: service.id });
				toast.success("Compose stack stopped");
			} else if (service.type === "postgres") {
				await postgresStop({ postgresId: service.id });
				toast.success("PostgreSQL stopped");
			} else if (service.type === "mysql") {
				await mysqlStop({ mysqlId: service.id });
				toast.success("MySQL stopped");
			} else if (service.type === "mariadb") {
				await mariadbStop({ mariadbId: service.id });
				toast.success("MariaDB stopped");
			} else if (service.type === "mongo") {
				await mongoStop({ mongoId: service.id });
				toast.success("MongoDB stopped");
			} else if (service.type === "redis") {
				await redisStop({ redisId: service.id });
				toast.success("Redis stopped");
			} else if (service.type === "libsql") {
				await libsqlStop({ libsqlId: service.id });
				toast.success("LibSQL stopped");
			}
			await Promise.all([
				utils.project.one.invalidate(),
				utils.project.all.invalidate(),
				utils.project.runtimeStatus.invalidate(),
			]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to stop service",
			);
		}
	};

	const isRunning = service.status === "running" || service.status === "done";
	const isError = service.status === "error";

	return (
		<section
			aria-label={`${service.name} service panel`}
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
			className="absolute bottom-0 right-0 top-4 z-40 flex w-full flex-col overflow-hidden rounded-tl-2xl border-l border-t border-[#34313f] bg-[#171522] text-[#f3f1f6] shadow-[-18px_0_50px_rgba(0,0,0,0.35)] sm:w-[88%] md:top-6 lg:w-[68%]"
		>
			{/* Top Header: #141120 background */}
			<header className="shrink-0 border-b border-[#34313f] bg-[#171522]">
				<div className="flex items-center justify-between gap-4 px-8 pb-5 pt-8 md:px-12 md:pt-10">
					{/* Left: 44x44 service icon in #1f1a2e, Title in text-xl font-bold, live status badge */}
					<div className="flex min-w-0 items-center gap-3.5">
						<div className="flex size-8 shrink-0 items-center justify-center">
							<ServiceIcon service={service} className="size-8" />
						</div>

						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<h2 className="truncate text-xl font-semibold tracking-tight text-white">
									{service.name}
								</h2>

								{/* Edit Name Modal Button */}
								{isApplication && (
									<UpdateApplication applicationId={service.id} />
								)}
								{isCompose && <UpdateCompose composeId={service.id} />}
								{service.type === "postgres" && (
									<UpdatePostgres postgresId={service.id} />
								)}
								{service.type === "mysql" && (
									<UpdateMysql mysqlId={service.id} />
								)}
								{service.type === "mariadb" && (
									<UpdateMariadb mariadbId={service.id} />
								)}
								{service.type === "mongo" && (
									<UpdateMongo mongoId={service.id} />
								)}
								{service.type === "redis" && (
									<UpdateRedis redisId={service.id} />
								)}
								{service.type === "libsql" && (
									<UpdateLibsql libsqlId={service.id} />
								)}
							</div>

							<div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
								{/* Live status badge with pulsing dot */}
								<div
									className={cn(
										"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium",
										isRunning
											? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
											: isError
												? "border-rose-500/30 bg-rose-500/10 text-rose-400"
												: "border-white/10 bg-white/[0.04] text-[#9a96a6]",
									)}
								>
									<span
										className={cn(
											"size-2 rounded-full",
											isRunning
												? "bg-emerald-400 animate-pulse ring-4 ring-emerald-400/20"
												: isError
													? "bg-rose-400 animate-pulse ring-4 ring-rose-400/20"
													: "bg-[#716d7e]",
										)}
									/>
									<span>
										{isRunning ? "Online" : isError ? "Error" : "Not deployed"}
									</span>
								</div>

								{service.appName && (
									<span className="font-mono text-[#787484]">
										{service.appName}
									</span>
								)}
							</div>
						</div>
					</div>

					{/* Right Toolbar */}
					<div className="ml-auto flex items-center gap-2">
						{canDeploy && (
							<>
								{/* "Deploy" button (violet gradient button #8b5cf6 with Rocket icon) */}
								{isDeployable && (
									<button
										type="button"
										onClick={handleQuickDeploy}
										disabled={isActionLoading}
										className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-400/30 bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-xs font-semibold text-white shadow-md shadow-violet-900/30 transition-all hover:from-violet-500 hover:to-indigo-500 hover:shadow-violet-900/50 disabled:opacity-50"
										title="Trigger new deployment"
									>
										<Rocket className="size-3.5" />
										<span className="hidden sm:inline">Deploy</span>
									</button>
								)}

								{/* "Restart" button (sleek dark button with RefreshCcw icon) */}
								<button
									type="button"
									onClick={handleQuickRestart}
									disabled={isActionLoading}
									className="flex h-8 items-center gap-1.5 rounded-lg border border-[#2b273c] bg-[#1a1727] px-3 text-xs font-medium text-[#d6d3e2] transition-colors hover:bg-[#231f33] hover:text-white disabled:opacity-50"
									title="Restart service"
								>
									<RefreshCcw
										className={cn(
											"size-3.5",
											isActionLoading && "animate-spin",
										)}
									/>
									<span className="hidden sm:inline">Restart</span>
								</button>

								{/* "Stop" / "Start" button */}
								{isRunning ? (
									<button
										type="button"
										onClick={handleQuickStop}
										disabled={isActionLoading}
										className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-[#22131c] px-3 text-xs font-medium text-rose-300 transition-colors hover:bg-[#2e1724] hover:text-rose-200 disabled:opacity-50"
										title="Stop service"
									>
										<Ban className="size-3.5" />
										<span className="hidden sm:inline">Stop</span>
									</button>
								) : (
									<button
										type="button"
										onClick={handleQuickStart}
										disabled={isActionLoading}
										className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-[#10241b] px-3 text-xs font-medium text-emerald-300 transition-colors hover:bg-[#153124] hover:text-emerald-200 disabled:opacity-50"
										title="Start service"
									>
										<Play className="size-3.5" />
										<span className="hidden sm:inline">Start</span>
									</button>
								)}
							</>
						)}

						{/* "Open App" (with ArrowUpRight icon if domain is present) */}
						{domainUrl && (
							<a
								href={domainUrl}
								target="_blank"
								rel="noreferrer"
								className="flex h-8 items-center gap-1.5 rounded-lg border border-[#2b273c] bg-[#1a1727] px-3 text-xs font-medium text-[#d6d3e2] transition-colors hover:bg-[#231f33] hover:text-white"
								title={`Open app at ${primaryDomain?.host}`}
							>
								<Globe2 className="size-3.5 text-sky-400" />
								<span className="hidden sm:inline">Open App</span>
								<ArrowUpRight className="size-3 text-[#8a8698]" />
							</a>
						)}

						{/* Full Page Link */}
						<TooltipProvider delayDuration={200}>
							<Tooltip>
								<TooltipTrigger asChild>
									<Link
										href={serviceHref}
										className="flex size-8 items-center justify-center rounded-lg border border-[#2b273c] bg-[#1a1727] text-[#9b97a7] transition-colors hover:bg-[#231f33] hover:text-white"
									>
										<ExternalLink className="size-3.5" />
									</Link>
								</TooltipTrigger>
								<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
									Open full page
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						{/* Close button with ESC keyboard badge */}
						<button
							type="button"
							onClick={onClose}
							aria-label="Close service panel"
							className="flex size-8 items-center justify-center rounded-md text-[#b8b4c1] transition-colors hover:bg-white/[0.06] hover:text-white"
						>
							<X className="size-4" />
							<kbd className="hidden">ESC</kbd>
						</button>
					</div>
				</div>

				{/* Tabs Bar: Exactly 5 pure-text tabs with glowing purple bottom border */}
				<nav
					className="flex gap-8 overflow-x-auto px-8 md:px-12 custom-logs-scrollbar"
					aria-label="Service tabs"
				>
					{PANEL_TABS.map((tab) => {
						const isActive = currentTab === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => handleSelectTab(tab.id)}
								className={cn(
									"relative h-12 shrink-0 px-0 text-base font-normal transition-colors select-none",
									isActive
										? "text-white"
										: "text-[#8d8998] hover:text-[#dedbe5]",
								)}
							>
								{tab.label}
								{isActive && (
									<span className="absolute inset-x-0 bottom-0 h-px bg-white" />
								)}
							</button>
						);
					})}
				</nav>
			</header>

			{/* Main Content Area */}
			<div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 md:px-12 custom-logs-scrollbar">
				<div className="railway-panel-content mx-auto max-w-[1040px] space-y-6 [&_.bg-background]:bg-[#141120] [&_.bg-card]:bg-[#141120] [&_.border]:border-[#231f32] [&_.rounded-xl]:rounded-xl [&_.shadow-md]:shadow-none [&_input]:bg-[#161322] [&_input]:border-[#2b273c] [&_textarea]:bg-[#161322] [&_textarea]:border-[#2b273c]">
					{/* 1. Deployments Tab */}
					{currentTab === "deployments" && (
						<RailwayDeploymentsTab
							service={service}
							projectId={projectId}
							environmentId={environmentId}
							isActionLoading={isActionLoading}
							onRemove={onRemove}
							onRestart={handleQuickRestart}
							onRedeploy={handleQuickRedeploy}
						/>
					)}

					{/* 2. Variables Tab */}
					{currentTab === "variables" && (
						<RailwayVariablesTab
							service={service}
							projectId={projectId}
							environmentId={environmentId}
						/>
					)}

					{/* 3. Metrics Tab */}
					{currentTab === "metrics" && <RailwayMetricsTab service={service} />}

					{/* 4. Console Tab */}
					{currentTab === "console" && <RailwayConsoleTab service={service} />}

					{/* 5. Settings Tab */}
					{currentTab === "settings" && (
						<RailwaySettingsTab
							service={service}
							projectId={projectId}
							environmentId={environmentId}
						/>
					)}
				</div>
			</div>

			{/* Footer Status Badge */}
			<div className="hidden">
				{currentTab === "metrics" ? (
					<Activity className="size-3 text-violet-400" />
				) : (
					<SquareTerminal className="size-3 text-violet-400" />
				)}
				<span>Dokploy Railway Engine</span>
			</div>
		</section>
	);
};

export default RailwayServicePanel;
