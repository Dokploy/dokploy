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
};

const menuItems: MenuItem[] = [
	{
		id: "health-check",
		label: "Health Check",
		description: "Configure health check settings",
	},
	{
		id: "restart-policy",
		label: "Restart Policy",
		description: "Configure restart policy",
	},
	{
		id: "placement",
		label: "Placement",
		description: "Configure placement constraints",
	},
	{
		id: "update-config",
		label: "Update Config",
		description: "Configure update strategy",
	},
	{
		id: "rollback-config",
		label: "Rollback Config",
		description: "Configure rollback strategy",
	},
	{ id: "mode", label: "Mode", description: "Configure service mode" },
	{ id: "labels", label: "Labels", description: "Configure service labels" },
	{
		id: "stop-grace-period",
		label: "Stop Grace Period",
		description: "Configure stop grace period",
	},
	{
		id: "endpoint-spec",
		label: "Endpoint Spec",
		description: "Configure endpoint specification",
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
							{menuItems.map((item) => (
								<button
									key={item.id}
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
									<div className="text-xs opacity-80">{item.description}</div>
								</button>
							))}
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
