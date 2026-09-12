import type { OverviewService } from "@dokploy/server/services/overview-shared";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { OverviewServiceIcon } from "@/components/dashboard/overview/show-overview-services";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface Props {
	isCollapsed: boolean;
}

// Application/compose keep deployment logs under their deployments tab; databases only have a general page.
const serviceHref = (service: OverviewService) => {
	const base = `/dashboard/project/${service.projectId}/environment/${service.environmentId}/services/${service.type}/${service.id}`;
	return service.type === "application" || service.type === "compose"
		? `${base}?tab=deployments`
		: base;
};

export const ActiveDeployments = ({ isCollapsed }: Props) => {
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: active } = api.overview.services.useQuery(
		{ status: "running" },
		{
			enabled: !!permissions?.service.read,
			// Poll faster while something is deploying so the indicator clears promptly
			refetchInterval: (query) => (query.state.data?.length ? 3000 : 10000),
		},
	);

	if (!active || active.length === 0) {
		return null;
	}

	const label = `${active.length} Active ${active.length === 1 ? "Deployment" : "Deployments"}`;
	const single = active.length === 1 ? active[0] : null;

	const button = (
		<Button
			variant="ghost"
			size={isCollapsed ? "icon" : "sm"}
			className={cn(
				"relative gap-1.5 px-2",
				isCollapsed && "h-8 w-8 p-1.5 mx-auto",
			)}
			aria-label={label}
			asChild={!!single}
		>
			{single ? (
				<Link href={serviceHref(single)}>
					<ActiveDeploymentsIcon
						count={active.length}
						isCollapsed={isCollapsed}
					/>
				</Link>
			) : (
				<ActiveDeploymentsIcon
					count={active.length}
					isCollapsed={isCollapsed}
				/>
			)}
		</Button>
	);

	const tooltip = (
		<TooltipContent side="right">
			{single ? `${label}: ${single.name}` : label}
		</TooltipContent>
	);

	if (single) {
		return (
			<SidebarMenuItem className={cn(isCollapsed && "mt-2")}>
				<Tooltip>
					<TooltipTrigger asChild>{button}</TooltipTrigger>
					{tooltip}
				</Tooltip>
			</SidebarMenuItem>
		);
	}

	return (
		<SidebarMenuItem className={cn(isCollapsed && "mt-2")}>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
					</TooltipTrigger>
					{tooltip}
				</Tooltip>
				<DropdownMenuContent align="start" side="right" className="w-80">
					<DropdownMenuLabel>{label}</DropdownMenuLabel>
					{active.map((service) => (
						<DropdownMenuItem key={service.id} asChild>
							<Link
								href={serviceHref(service)}
								className="flex items-center gap-2 cursor-pointer"
							>
								<OverviewServiceIcon
									service={service}
									className="size-4 shrink-0"
								/>
								<div className="flex flex-col min-w-0 flex-1">
									<span className="text-sm truncate">{service.name}</span>
									<span className="text-xs text-muted-foreground truncate">
										{service.projectName} · {service.environmentName}
									</span>
								</div>
								<div className="flex flex-col items-end gap-0.5 shrink-0 text-xs text-muted-foreground">
									<span className="flex items-center gap-1">
										<Loader2 className="size-3 animate-spin text-yellow-600 dark:text-yellow-500" />
										Deploying
									</span>
									{service.lastDeployAt && (
										<span className="text-[10px] whitespace-nowrap">
											{formatDistanceToNow(new Date(service.lastDeployAt), {
												addSuffix: true,
											})}
										</span>
									)}
								</div>
							</Link>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);
};

const ActiveDeploymentsIcon = ({
	count,
	isCollapsed,
}: {
	count: number;
	isCollapsed: boolean;
}) => (
	<>
		<Loader2 className="size-4 animate-spin text-yellow-600 dark:text-yellow-500" />
		{isCollapsed ? (
			<span className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-full bg-yellow-500 text-xs text-black">
				{count}
			</span>
		) : (
			<span className="text-xs tabular-nums">{count} active</span>
		)}
	</>
);
