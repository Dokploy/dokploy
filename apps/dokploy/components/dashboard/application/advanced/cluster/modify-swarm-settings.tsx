import { ExternalLink, Settings } from "lucide-react";
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
	docUrl?: string;
	docDescription?: string;
};

const menuItems: MenuItem[] = [
	{
		id: "health-check",
		label: "Health Check",
		description: "Configure health check settings",
		docUrl:
			"https://docs.docker.com/reference/cli/docker/service/create/#healthcheck",
		docDescription:
			"Configure HEALTHCHECK to test a container's health. Determines if a container is healthy by running a command inside the container.",
	},
	{
		id: "restart-policy",
		label: "Restart Policy",
		description: "Configure restart policy",
		docUrl:
			"https://docs.docker.com/reference/cli/docker/service/create/#restart-policy",
		docDescription:
			"Configure the restart policy for containers in the service. Controls when and how containers should be restarted.",
	},
	{
		id: "placement",
		label: "Placement",
		description: "Configure placement constraints",
		docUrl:
			"https://docs.docker.com/reference/cli/docker/service/create/#placement-pref",
		docDescription:
			"Control which nodes service tasks can be scheduled on. Use constraints, preferences, and platform specifications.",
	},
	{
		id: "update-config",
		label: "Update Config",
		description: "Configure update strategy",
		docUrl:
			"https://docs.docker.com/reference/cli/docker/service/create/#update-config",
		docDescription:
			"Configure how the service should be updated. Controls parallelism, delay, failure action, and order of updates.",
	},
	{
		id: "rollback-config",
		label: "Rollback Config",
		description: "Configure rollback strategy",
		docUrl:
			"https://docs.docker.com/reference/cli/docker/service/create/#rollback-config",
		docDescription:
			"Configure automated rollback on update failure. Similar to update config but applies to rollback operations.",
	},
	{
		id: "mode",
		label: "Mode",
		description: "Configure service mode",
		docUrl: "https://docs.docker.com/reference/cli/docker/service/create/#mode",
		docDescription:
			"Set service mode to either 'replicated' (default) with a specified number of tasks, or 'global' (one task per node).",
	},
	{
		id: "labels",
		label: "Labels",
		description: "Configure service labels",
		docUrl:
			"https://docs.docker.com/reference/cli/docker/service/create/#label",
		docDescription:
			"Add metadata to services using labels. Labels are key-value pairs for organizing and filtering services.",
	},
	{
		id: "stop-grace-period",
		label: "Stop Grace Period",
		description: "Configure stop grace period",
		docUrl:
			"https://docs.docker.com/reference/cli/docker/service/create/#stop-grace-period",
		docDescription:
			"Time to wait before forcefully killing a container. Given in nanoseconds. Default is 10 seconds.",
	},
	{
		id: "endpoint-spec",
		label: "Endpoint Spec",
		description: "Configure endpoint specification",
		docUrl:
			"https://docs.docker.com/reference/cli/docker/service/create/#endpoint-mode",
		docDescription:
			"Configure endpoint mode for service discovery. Choose between 'vip' (virtual IP) or 'dnsrr' (DNS round-robin).",
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
									<div key={item.id} className="relative group">
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
											<div className="flex items-center justify-between gap-2">
												<div className="flex-1">
													<div className="font-medium">{item.label}</div>
													<div className="text-xs opacity-80">
														{item.description}
													</div>
												</div>
												{item.docUrl && (
													<Tooltip>
														<TooltipTrigger asChild>
															<a
																href={item.docUrl}
																target="_blank"
																rel="noopener noreferrer"
																onClick={(e) => e.stopPropagation()}
															>
																<ExternalLink className="size-3.5" />
															</a>
														</TooltipTrigger>
														<TooltipContent side="right" className="max-w-xs">
															<p className="text-xs">{item.docDescription}</p>
														</TooltipContent>
													</Tooltip>
												)}
											</div>
										</button>
									</div>
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
