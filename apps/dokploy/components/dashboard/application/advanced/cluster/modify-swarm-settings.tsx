import { Settings } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
		label: "application.swarm.healthCheck.label",
		description: "application.swarm.healthCheck.description",
		docDescription: "application.swarm.healthCheck.docDescription",
	},
	{
		id: "restart-policy",
		label: "application.swarm.restartPolicy.label",
		description: "application.swarm.restartPolicy.description",
		docDescription: "application.swarm.restartPolicy.docDescription",
	},
	{
		id: "placement",
		label: "application.swarm.placement.label",
		description: "application.swarm.placement.description",
		docDescription: "application.swarm.placement.docDescription",
	},
	{
		id: "update-config",
		label: "application.swarm.updateConfig.label",
		description: "application.swarm.updateConfig.description",
		docDescription: "application.swarm.updateConfig.docDescription",
	},
	{
		id: "rollback-config",
		label: "application.swarm.rollbackConfig.label",
		description: "application.swarm.rollbackConfig.description",
		docDescription: "application.swarm.rollbackConfig.docDescription",
	},
	{
		id: "mode",
		label: "application.swarm.mode.label",
		description: "application.swarm.mode.description",
		docDescription: "application.swarm.mode.docDescription",
	},
	{
		id: "network",
		label: "application.swarm.network.label",
		description: "application.swarm.network.description",
		docDescription: "application.swarm.network.docDescription",
	},
	{
		id: "labels",
		label: "application.swarm.labels.label",
		description: "application.swarm.labels.description",
		docDescription: "application.swarm.labels.docDescription",
	},
	{
		id: "stop-grace-period",
		label: "application.swarm.stopGracePeriod.label",
		description: "application.swarm.stopGracePeriod.description",
		docDescription: "application.swarm.stopGracePeriod.docDescription",
	},
	{
		id: "endpoint-spec",
		label: "application.swarm.endpointSpec.label",
		description: "application.swarm.endpointSpec.description",
		docDescription: "application.swarm.endpointSpec.docDescription",
	},
];

const hasStopGracePeriodSwarm = (
	value: unknown,
): value is { stopGracePeriodSwarm: number | string | null } =>
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
	const { t } = useTranslation();
	const [activeMenu, setActiveMenu] = useState<string>("health-check");
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" className="cursor-pointer w-fit">
					<Settings className="size-4 text-muted-foreground" />
					{t("application.swarm.settings")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl max-h-[85vh]">
				<DialogHeader>
					<DialogTitle>{t("application.swarm.settings")}</DialogTitle>
					<DialogDescription>
						{t("application.swarm.settingsDescription")}
					</DialogDescription>
				</DialogHeader>
				<div>
					<AlertBlock type="info">
						{t("application.swarm.settingsWarning")}
					</AlertBlock>
				</div>

				<div className="flex gap-4 h-[60vh] py-4">
					{/* Left Column - Menu */}
					<div className="w-64 shrink-0 border-r pr-4 overflow-y-auto">
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
												<div className="font-medium">{t(item.label)}</div>
												<div className="text-xs opacity-80">
													{t(item.description)}
												</div>
											</button>
										</TooltipTrigger>
										<TooltipContent side="right" className="max-w-xs">
											<p className="text-xs">{t(item.docDescription)}</p>
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
