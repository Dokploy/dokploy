import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
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

const MENU_CONFIG = [
	{ id: "health-check", nsKey: "healthCheck" },
	{ id: "restart-policy", nsKey: "restartPolicy" },
	{ id: "placement", nsKey: "placement" },
	{ id: "update-config", nsKey: "updateConfig" },
	{ id: "rollback-config", nsKey: "rollbackConfig" },
	{ id: "mode", nsKey: "mode" },
	{ id: "network", nsKey: "network" },
	{ id: "labels", nsKey: "labels" },
	{ id: "stop-grace-period", nsKey: "stopGracePeriod" },
	{ id: "endpoint-spec", nsKey: "endpointSpec" },
] as const;

interface Props {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const AddSwarmSettings = ({ id, type }: Props) => {
	const t = useTranslations("applicationAdvancedSwarmForms");
	const [activeMenu, setActiveMenu] = useState<string>("health-check");
	const [open, setOpen] = useState(false);

	const menuItems = useMemo(
		() =>
			MENU_CONFIG.map(({ id: menuId, nsKey }) => ({
				id: menuId,
				label: t(`menu.${nsKey}.label`),
				description: t(`menu.${nsKey}.description`),
				docDescription: t(`menu.${nsKey}.doc`),
			})),
		[t],
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" className="cursor-pointer w-fit">
					<Settings className="size-4 text-muted-foreground" />
					{t("modify.button")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-6xl max-h-[85vh]">
				<DialogHeader>
					<DialogTitle>{t("modify.title")}</DialogTitle>
					<DialogDescription>{t("modify.description")}</DialogDescription>
				</DialogHeader>
				<div>
					<AlertBlock type="info">{t("modify.alert")}</AlertBlock>
				</div>

				<div className="flex gap-4 h-[60vh] py-4">
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
