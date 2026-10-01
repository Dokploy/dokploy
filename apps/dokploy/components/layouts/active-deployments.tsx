import { getOverviewServiceHref } from "@dokploy/server/services/overview-shared";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { OverviewServiceIcon } from "@/components/dashboard/overview/show-overview-services";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	activeDeploymentPollInterval,
	changesDeploymentStatus,
} from "@/utils/active-deployments";
import { api } from "@/utils/api";

export const ActiveDeployments = () => {
	const [open, setOpen] = useState(false);
	const { data: permissions } = api.user.getPermissions.useQuery();
	const utils = api.useUtils();
	const queryClient = useQueryClient();
	const canRead = !!permissions?.service.read;
	const { data: summary } = api.overview.activeDeploymentSummary.useQuery(
		undefined,
		{
			enabled: canRead,
			staleTime: 15_000,
			refetchInterval: (query) =>
				activeDeploymentPollInterval(query.state.data?.count ?? 0),
			refetchIntervalInBackground: false,
		},
	);
	const detailsOpen = open && (summary?.count ?? 0) > 1;
	useEffect(() => {
		if (!canRead || (summary?.count ?? 0) <= 1) setOpen(false);
	}, [canRead, summary?.count]);
	const {
		data: active,
		isLoading,
		isError,
	} = api.overview.services.useQuery(
		{ status: "running" },
		{
			enabled: canRead && detailsOpen,
			staleTime: 0,
			refetchInterval: detailsOpen ? 15_000 : false,
			refetchIntervalInBackground: false,
		},
	);
	useEffect(
		() =>
			queryClient.getMutationCache().subscribe((event) => {
				if (
					canRead &&
					event.type === "updated" &&
					event.action.type === "success" &&
					changesDeploymentStatus(event.mutation.options.mutationKey)
				) {
					void utils.overview.activeDeploymentSummary.invalidate();
					void utils.overview.activeDeploymentsByOrganization.invalidate();
					if (detailsOpen)
						void utils.overview.services.invalidate({ status: "running" });
				}
			}),
		[canRead, detailsOpen, queryClient, utils],
	);

	if (!canRead || !summary?.count) return null;
	const count = summary.count;
	const canReadDeployments = !!permissions?.deployment.read;
	const label = `${count} Active ${count === 1 ? "Deployment" : "Deployments"}`;
	const single = summary.single;

	const button = (
		<Button
			variant="ghost"
			size="icon"
			className="relative size-8 p-1.5 text-yellow-700 dark:text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-700 dark:hover:text-yellow-400"
			aria-label={label}
			asChild={!!single}
		>
			{single ? (
				<Link href={getOverviewServiceHref(single, { canReadDeployments })}>
					<ActiveDeploymentsIcon count={count} />
				</Link>
			) : (
				<ActiveDeploymentsIcon count={count} />
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
			<>
				<Tooltip>
					<TooltipTrigger asChild>{button}</TooltipTrigger>
					{tooltip}
				</Tooltip>
			</>
		);
	}

	return (
		<>
			<DropdownMenu open={detailsOpen} onOpenChange={setOpen}>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
					</TooltipTrigger>
					{tooltip}
				</Tooltip>
				<DropdownMenuContent align="start" side="right" className="w-80">
					<DropdownMenuLabel>{label}</DropdownMenuLabel>
					{isLoading && (
						<DropdownMenuItem disabled>Loading deployments…</DropdownMenuItem>
					)}
					{isError && (
						<DropdownMenuItem disabled>
							Unable to load deployments
						</DropdownMenuItem>
					)}
					{!isLoading && !isError && active?.length === 0 && (
						<DropdownMenuItem disabled>No active deployments</DropdownMenuItem>
					)}
					{active?.map((service) => (
						<DropdownMenuItem key={service.id} asChild>
							<Link
								href={getOverviewServiceHref(service, { canReadDeployments })}
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
		</>
	);
};

const ActiveDeploymentsIcon = ({ count }: { count: number }) => (
	<>
		<Loader2 className="size-4 animate-spin" />
		<span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-0.5 text-[10px] font-medium tabular-nums text-black">
			{count > 99 ? "99+" : count}
		</span>
	</>
);
