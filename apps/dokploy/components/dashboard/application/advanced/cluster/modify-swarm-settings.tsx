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
import {
	EndpointSpecForm,
	HealthCheckForm,
	LabelsForm,
	ModeForm,
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
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const AddSwarmSettings = ({ id, type }: Props) => {
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
