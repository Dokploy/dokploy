import type { OverviewDomainSortBy } from "@dokploy/server/services/overview-shared";
import { sortOverviewDomains } from "@dokploy/server/services/overview-shared";
import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { COMPOSE_REDEPLOY_TOAST } from "@/components/dashboard/application/domains/redeploy-hint";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSortPreference } from "@/hooks/use-sort-preference";
import { api } from "@/utils/api";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

const SORT_OPTIONS: { value: OverviewDomainSortBy; label: string }[] = [
	{ value: "createdAt-desc", label: "overview.domains.sort.newestFirst" },
	{ value: "createdAt-asc", label: "overview.domains.sort.oldestFirst" },
	{ value: "port-asc", label: "overview.domains.sort.portLow" },
	{ value: "port-desc", label: "overview.domains.sort.portHigh" },
];

const SORT_VALUES = SORT_OPTIONS.map((opt) => opt.value);

export const ShowOverviewDomains = () => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canToggleDomain = permissions?.domain.create ?? false;

	const { data: domains, isLoading } = api.overview.domains.useQuery();
	const { data: allProjects } = api.project.all.useQuery();

	const { mutateAsync: toggleEnable, isPending: isToggling } =
		api.domain.toggleEnable.useMutation();

	const [selectedProjectId, setSelectedProjectId] = useState("all");
	const [selectedStatus, setSelectedStatus] = useState("all");
	const [selectedSsl, setSelectedSsl] = useState("all");
	const [selectedPort, setSelectedPort] = useState("all");
	const [sortBy, setSort] = useSortPreference<OverviewDomainSortBy>(
		"overviewDomainsSort",
		"createdAt-desc",
		SORT_VALUES,
	);

	const handleToggleEnable = async (
		domain: NonNullable<typeof domains>[number],
	) => {
		try {
			const result = await toggleEnable({ domainId: domain.domainId });
			utils.overview.domains.invalidate();
			toast.success(
				result.enabled
					? t("overview.domains.enabledToast")
					: t("overview.domains.disabledToast"),
				result.requiresRedeploy
					? { description: COMPOSE_REDEPLOY_TOAST }
					: undefined,
			);
		} catch {
			toast.error(t("overview.domains.updateError", { host: domain.host }));
		}
	};

	const availablePorts = useMemo(() => {
		if (!domains) return [];
		const ports = new Set<number>();
		for (const domain of domains) {
			if (domain.port !== null) ports.add(domain.port);
		}
		return Array.from(ports).sort((a, b) => a - b);
	}, [domains]);

	const filteredDomains = useMemo(() => {
		if (!domains) return [];
		const filtered = domains.filter(
			(domain) =>
				(selectedProjectId === "all" ||
					domain.projectId === selectedProjectId) &&
				(selectedStatus === "all" ||
					(selectedStatus === "enabled" ? domain.enabled : !domain.enabled)) &&
				(selectedSsl === "all" ||
					(selectedSsl === "https" ? domain.https : !domain.https)) &&
				(selectedPort === "all" || domain.port === Number(selectedPort)),
		);
		return sortOverviewDomains(filtered, sortBy);
	}, [
		domains,
		selectedProjectId,
		selectedStatus,
		selectedSsl,
		selectedPort,
		sortBy,
	]);

	const [pageSize, setPageSize] = useState(50);
	const [pageIndex, setPageIndex] = useState(0);
	const pageCount = Math.max(1, Math.ceil(filteredDomains.length / pageSize));
	const currentPageIndex = Math.min(pageIndex, pageCount - 1);
	const pagedDomains = filteredDomains.slice(
		currentPageIndex * pageSize,
		currentPageIndex * pageSize + pageSize,
	);

	return (
		<Card className="bg-sidebar p-2.5 rounded-xl w-full">
			<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3 justify-between">
					<h3 className="text-lg font-medium">
						Domains{" "}
						<span className="text-sm font-normal text-muted-foreground">
							({filteredDomains.length})
						</span>
					</h3>
					<div className="flex flex-wrap items-center gap-2">
						<Select
							value={selectedProjectId}
							onValueChange={setSelectedProjectId}
						>
							<SelectTrigger className="w-[160px]">
								<SelectValue
									placeholder={t("overview.domains.filterProject")}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									{t("overview.domains.allProjects")}
								</SelectItem>
								{allProjects?.map((project) => (
									<SelectItem key={project.projectId} value={project.projectId}>
										{project.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select value={selectedStatus} onValueChange={setSelectedStatus}>
							<SelectTrigger className="w-[130px]">
								<SelectValue placeholder={t("overview.domains.filterStatus")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									{t("overview.domains.allStatuses")}
								</SelectItem>
								<SelectItem value="enabled">
									{t("overview.domains.enabled")}
								</SelectItem>
								<SelectItem value="disabled">
									{t("overview.domains.disabled")}
								</SelectItem>
							</SelectContent>
						</Select>
						<Select value={selectedSsl} onValueChange={setSelectedSsl}>
							<SelectTrigger className="w-[130px]">
								<SelectValue placeholder={t("overview.domains.filterSsl")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									{t("overview.domains.sslAll")}
								</SelectItem>
								<SelectItem value="https">
									{t("overview.domains.sslHttpsOnly")}
								</SelectItem>
								<SelectItem value="http">
									{t("overview.domains.sslHttpOnly")}
								</SelectItem>
							</SelectContent>
						</Select>
						{availablePorts.length > 0 && (
							<Select value={selectedPort} onValueChange={setSelectedPort}>
								<SelectTrigger className="w-[120px]">
									<SelectValue placeholder={t("overview.domains.filterPort")} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t("overview.allPorts")}</SelectItem>
									{availablePorts.map((port) => (
										<SelectItem key={port} value={String(port)}>
											{port}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						<Select
							value={sortBy}
							onValueChange={(v) => setSort(v as OverviewDomainSortBy)}
						>
							<SelectTrigger className="w-[170px]">
								<SelectValue placeholder={t("overview.domains.sortBy")} />
							</SelectTrigger>
							<SelectContent>
								{SORT_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{t(opt.label)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{isLoading && (
					<div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Loading domains...
					</div>
				)}

				{!isLoading && filteredDomains.length === 0 && (
					<div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
						<span>No domains match the current filters.</span>
					</div>
				)}

				{!isLoading && filteredDomains.length > 0 && (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("overview.domains.colService")}</TableHead>
									<TableHead>{t("overview.domains.colHost")}</TableHead>
									<TableHead>{t("overview.domains.colPath")}</TableHead>
									<TableHead>{t("overview.domains.colPort")}</TableHead>
									<TableHead>{t("overview.domains.colEntrypoint")}</TableHead>
									<TableHead>{t("overview.domains.colProtocol")}</TableHead>
									<TableHead>{t("overview.domains.colCertificate")}</TableHead>
									<TableHead>{t("overview.domains.colCreated")}</TableHead>
									<TableHead className="text-right">Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{pagedDomains.map((domain) => {
									const href = `/dashboard/project/${domain.projectId}/environment/${domain.environmentId}/services/${domain.serviceOwnerType}/${domain.serviceOwnerId}`;
									return (
										<TableRow key={domain.domainId}>
											<TableCell>
												<Link href={href} className="flex flex-col min-w-0">
													<span className="font-medium truncate">
														{domain.serviceName}
													</span>
													<span className="text-xs font-normal text-muted-foreground">
														{domain.projectName} / {domain.environmentName}
													</span>
												</Link>
											</TableCell>
											<TableCell>
												<Link
													className="flex items-center gap-2 font-medium hover:underline"
													target="_blank"
													href={`${domain.https ? "https" : "http"}://${domain.host}${domain.path}`}
												>
													{domain.host}
													<ExternalLink className="size-3" />
												</Link>
											</TableCell>
											<TableCell>
												<span className="font-mono text-sm">
													{domain.path || "/"}
												</span>
											</TableCell>
											<TableCell>
												<Badge variant="secondary">{domain.port}</Badge>
											</TableCell>
											<TableCell>
												{domain.customEntrypoint ? (
													<span className="font-mono text-sm">
														{domain.customEntrypoint}
													</span>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
											<TableCell>
												<Badge variant={domain.https ? "outline" : "secondary"}>
													{domain.https ? "HTTPS" : "HTTP"}
												</Badge>
											</TableCell>
											<TableCell>
												<Badge variant="outline" className="capitalize">
													{domain.certificateType}
												</Badge>
											</TableCell>
											<TableCell>
												<DateTooltip date={domain.createdAt} />
											</TableCell>
											<TableCell className="text-right">
												{canToggleDomain ? (
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<div className="flex items-center justify-end">
																	<Switch
																		checked={domain.enabled}
																		onCheckedChange={() =>
																			handleToggleEnable(domain)
																		}
																		disabled={isToggling}
																	/>
																</div>
															</TooltipTrigger>
															<TooltipContent>
																<p>
																	{domain.enabled
																		? t("overview.domains.activeHint")
																		: t("overview.domains.disabledHint")}
																</p>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												) : (
													<Badge
														variant={domain.enabled ? "outline" : "secondary"}
													>
														{domain.enabled
															? t("overview.domains.enabled")
															: t("overview.domains.disabled")}
													</Badge>
												)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>

						<div className="flex items-center justify-between text-sm text-muted-foreground">
							<span>
								{t("overview.domains.totalCount", {
									count: filteredDomains.length,
								})}
							</span>
							<div className="flex items-center gap-3">
								<div className="flex items-center gap-2">
									<span className="whitespace-nowrap">
										{t("overview.domains.rowsPerPage")}
									</span>
									<Select
										value={String(pageSize)}
										onValueChange={(value) => {
											setPageSize(Number(value));
											setPageIndex(0);
										}}
									>
										<SelectTrigger className="w-[80px] h-8">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PAGE_SIZE_OPTIONS.map((size) => (
												<SelectItem key={size} value={String(size)}>
													{size}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<span className="whitespace-nowrap">
									{t("overview.domains.pageOf", {
										page: currentPageIndex + 1,
										total: pageCount,
									})}
								</span>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setPageIndex(currentPageIndex - 1)}
										disabled={currentPageIndex === 0}
									>
										Previous
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setPageIndex(currentPageIndex + 1)}
										disabled={currentPageIndex + 1 >= pageCount}
									>
										Next
									</Button>
								</div>
							</div>
						</div>
					</>
				)}
			</div>
		</Card>
	);
};
