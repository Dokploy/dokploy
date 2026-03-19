import { Settings } from "lucide-react";
import { useState } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import {
	EndpointSpecForm,
	HealthCheckForm,
	LabelsForm,
	ModeForm,
	NetworkForm,
	PlacementForm,
	RestartPolicyForm,
	RollbackConfigForm,
	StopGracePeriodForm,
	UpdateConfigForm,
} from "./swarm-forms";

type MenuItem = {
	id: string;
	label: string;
	description: string;
	docDescription: string;
};

const menuItems: MenuItem[] = [
	{
		id: "health-check",
		label: "Health Check",
		description: "Configure health check settings",
		docDescription:
			"Configure HEALTHCHECK to test a container's health. Determines if a container is healthy by running a command inside the container. Test, Interval, Timeout, StartPeriod, and Retries control health monitoring.",
	},
	{
		id: "restart-policy",
		label: "Restart Policy",
		description: "Configure restart policy",
		docDescription:
			"Configure the restart policy for containers in the service. Condition (none, on-failure, any), Delay (nanoseconds between restarts), MaxAttempts, and Window control restart behavior.",
	},
	{
		id: "placement",
		label: "Placement",
		description: "Configure placement constraints",
		docDescription:
			"Control which nodes service tasks can be scheduled on. Constraints (node.id==xyz), Preferences (spread.node.labels.zone), MaxReplicas, and Platforms specify task placement rules.",
	},
	{
		id: "update-config",
		label: "Update Config",
		description: "Configure update strategy",
		docDescription:
			"Configure how the service should be updated. Parallelism (tasks updated simultaneously), Delay, FailureAction (pause, continue, rollback), Monitor, MaxFailureRatio, and Order (stop-first, start-first) control updates.",
	},
	{
		id: "rollback-config",
		label: "Rollback Config",
		description: "Configure rollback strategy",
		docDescription:
			"Configure automated rollback on update failure. Uses same parameters as UpdateConfig: Parallelism, Delay, FailureAction, Monitor, MaxFailureRatio, and Order.",
	},
	{
		id: "mode",
		label: "Mode",
		description: "Configure service mode",
		docDescription:
			"Set service mode to either 'Replicated' with a specified number of tasks (Replicas), or 'Global' (one task per node).",
	},
	{
		id: "network",
		label: "Network",
		description: "Configure network attachments",
		docDescription:
			"Attach the service to one or more networks. Specify the network name (Target) and optional network aliases for service discovery.",
	},
	{
		id: "labels",
		label: "Labels",
		description: "Configure service labels",
		docDescription:
			"Add metadata to services using labels. Labels are key-value pairs (e.g., com.example.foo=bar) for organizing and filtering services.",
	},
	{
		id: "stop-grace-period",
		label: "Stop Grace Period",
		description: "Configure stop grace period",
		docDescription:
			"Time to wait before forcefully killing a container. Specified in nanoseconds (e.g., 10000000000 = 10 seconds). Allows containers to shutdown gracefully.",
	},
	{
		id: "endpoint-spec",
		label: "Endpoint Spec",
		description: "Configure endpoint specification",
		docDescription:
			"Configure endpoint mode for service discovery. Mode 'vip' (virtual IP - default) uses a single virtual IP. Mode 'dnsrr' (DNS round-robin) returns DNS entries for all tasks.",
	},
];

const hasStopGracePeriodSwarm = (
	value: unknown,
): value is { stopGracePeriodSwarm: bigint | number | string | null } =>
	typeof value === "object" &&
	value !== null &&
	"stopGracePeriodSwarm" in value;

interface Props {
	id: string;
	type:
		| "application"
		| "libsql"
		| "mariadb"
		| "mongo"
		| "mysql"
		| "postgres"
		| "redis";
}

export const AddSwarmSettings = ({ id, type }: Props) => {
	const queryMap = {
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		libsql: () => api.libsql.one.useQuery({ libsqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });

	const mutationMap = {
		application: () => api.application.update.useMutation(),
		libsql: () => api.libsql.update.useMutation(),
		mariadb: () => api.mariadb.update.useMutation(),
		mongo: () => api.mongo.update.useMutation(),
		mysql: () => api.mysql.update.useMutation(),
		postgres: () => api.postgres.update.useMutation(),
		redis: () => api.redis.update.useMutation(),
	};

	const { mutateAsync, isError, error, isLoading } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const form = useForm<AddSwarmSettings>({
		defaultValues: {
			healthCheckSwarm: null,
			restartPolicySwarm: null,
			placementSwarm: null,
			updateConfigSwarm: null,
			rollbackConfigSwarm: null,
			modeSwarm: null,
			labelsSwarm: null,
			networkSwarm: null,
		},
		resolver: zodResolver(addSwarmSettings),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				healthCheckSwarm: data.healthCheckSwarm
					? JSON.stringify(data.healthCheckSwarm, null, 2)
					: null,
				restartPolicySwarm: data.restartPolicySwarm
					? JSON.stringify(data.restartPolicySwarm, null, 2)
					: null,
				placementSwarm: data.placementSwarm
					? JSON.stringify(data.placementSwarm, null, 2)
					: null,
				updateConfigSwarm: data.updateConfigSwarm
					? JSON.stringify(data.updateConfigSwarm, null, 2)
					: null,
				rollbackConfigSwarm: data.rollbackConfigSwarm
					? JSON.stringify(data.rollbackConfigSwarm, null, 2)
					: null,
				modeSwarm: data.modeSwarm
					? JSON.stringify(data.modeSwarm, null, 2)
					: null,
				labelsSwarm: data.labelsSwarm
					? JSON.stringify(data.labelsSwarm, null, 2)
					: null,
				networkSwarm: data.networkSwarm
					? JSON.stringify(data.networkSwarm, null, 2)
					: null,
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: AddSwarmSettings) => {
		await mutateAsync({
			applicationId: id || "",
			libsqlId: id || "",
			mariadbId: id || "",
			mongoId: id || "",
			mysqlId: id || "",
			postgresId: id || "",
			redisId: id || "",
			healthCheckSwarm: data.healthCheckSwarm,
			restartPolicySwarm: data.restartPolicySwarm,
			placementSwarm: data.placementSwarm,
			updateConfigSwarm: data.updateConfigSwarm,
			rollbackConfigSwarm: data.rollbackConfigSwarm,
			modeSwarm: data.modeSwarm,
			labelsSwarm: data.labelsSwarm,
			networkSwarm: data.networkSwarm,
		})
			.then(async () => {
				toast.success("Swarm settings updated");
				refetch();
			})
			.catch(() => {
				toast.error("Error updating the swarm settings");
			});
	};
	const [activeMenu, setActiveMenu] = useState<string>("health-check");
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" className="cursor-pointer w-fit">
					<Settings className="size-4 text-muted-foreground" />
					Swarm Settings
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl max-h-[85vh]">
				<DialogHeader>
					<DialogTitle>Swarm Settings</DialogTitle>
					<DialogDescription>
						Configure swarm settings for your service.
					</DialogDescription>
				</DialogHeader>
				<div>
					<AlertBlock type="info">
						Changing settings such as placements may cause the logs/monitoring,
						backups and other features to be unavailable.
					</AlertBlock>
				</div>

				<div className="flex gap-4 h-[60vh] py-4">
					{/* Left Column - Menu */}
					<div className="w-64 flex-shrink-0 border-r pr-4 overflow-y-auto">
						<nav className="space-y-1">
							<TooltipProvider>
								{menuItems.map((item) => (
									<Tooltip key={item.id}>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={() => setActiveMenu(item.id)}
												className={cn(
													"w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
													activeMenu === item.id
														? "bg-primary text-primary-foreground"
														: "hover:bg-muted",
												)}
											>
												<div className="font-medium">{item.label}</div>
												<div className="text-xs opacity-80">
													{item.description}
												</div>
											</button>
										</TooltipTrigger>
										<TooltipContent side="right" className="max-w-xs">
											<p className="text-xs">{item.docDescription}</p>
										</TooltipContent>
									</Tooltip>
								))}
							</TooltipProvider>
						</nav>
					</div>

					{/* Right Column - Form */}
					<div className="flex-1 overflow-y-auto">
						{activeMenu === "health-check" && (
							<HealthCheckForm id={id} type={type} />
						)}
						{activeMenu === "restart-policy" && (
							<RestartPolicyForm id={id} type={type} />
						)}
						{activeMenu === "placement" && (
							<PlacementForm id={id} type={type} />
						)}
						{activeMenu === "update-config" && (
							<UpdateConfigForm id={id} type={type} />
						)}
						{activeMenu === "rollback-config" && (
							<RollbackConfigForm id={id} type={type} />
						)}
						{activeMenu === "mode" && <ModeForm id={id} type={type} />}
						{activeMenu === "network" && <NetworkForm id={id} type={type} />}
						{activeMenu === "labels" && <LabelsForm id={id} type={type} />}
						{activeMenu === "stop-grace-period" && (
							<StopGracePeriodForm id={id} type={type} />
						)}
						{activeMenu === "endpoint-spec" && (
							<EndpointSpecForm id={id} type={type} />
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
