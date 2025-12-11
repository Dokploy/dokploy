import {
	AlertTriangle,
	ArrowUpDown,
	BookIcon,
	ExternalLinkIcon,
	FolderInput,
	Loader2,
	MoreHorizontalIcon,
	Search,
	TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { FocusShortcutInput } from "@/components/shared/focus-shortcut-input";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { TimeBadge } from "@/components/ui/time-badge";
import { api } from "@/utils/api";
import { HandleProject } from "./handle-project";
import { ProjectEnvironment } from "./project-environment";

export const ShowProjects = () => {
	const utils = api.useUtils();
	const { t } = useTranslation("common");
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data, isLoading } = api.project.all.useQuery();
	const { data: auth } = api.user.get.useQuery();
	const { mutateAsync } = api.project.remove.useMutation();
	const [searchQuery, setSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState<string>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("projectsSort") || "createdAt-desc";
		}
		return "createdAt-desc";
	});

	useEffect(() => {
		localStorage.setItem("projectsSort", sortBy);
	}, [sortBy]);

	const filteredProjects = useMemo(() => {
		if (!data) return [];

		// First filter by search query
		const filtered = data.filter(
			(project) =>
				project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				project.description?.toLowerCase().includes(searchQuery.toLowerCase()),
		);

		// Then sort the filtered results
		const [field, direction] = sortBy.split("-");
		return [...filtered].sort((a, b) => {
			let comparison = 0;
			switch (field) {
				case "name":
					comparison = a.name.localeCompare(b.name);
					break;
				case "createdAt":
					comparison =
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
					break;
				case "services": {
					const aTotalServices = a.environments.reduce((total, env) => {
						return (
							total +
							(env.applications?.length || 0) +
							(env.mariadb?.length || 0) +
							(env.mongo?.length || 0) +
							(env.mysql?.length || 0) +
							(env.postgres?.length || 0) +
							(env.redis?.length || 0) +
							(env.compose?.length || 0)
						);
					}, 0);
					const bTotalServices = b.environments.reduce((total, env) => {
						return (
							total +
							(env.applications?.length || 0) +
							(env.mariadb?.length || 0) +
							(env.mongo?.length || 0) +
							(env.mysql?.length || 0) +
							(env.postgres?.length || 0) +
							(env.redis?.length || 0) +
							(env.compose?.length || 0)
						);
					}, 0);
					comparison = aTotalServices - bTotalServices;
					break;
				}
				default:
					comparison = 0;
			}
			return direction === "asc" ? comparison : -comparison;
		});
	}, [data, searchQuery, sortBy]);

	return (
		<>
			<BreadcrumbSidebar
				list={[
					{ name: t("dashboard.projects"), href: "/dashboard/projects" },
				]}
			/>
			{!isCloud && (
				<div className="absolute top-4 right-4">
					<TimeBadge />
				</div>
			)}
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl  ">
					<div className="rounded-xl bg-background shadow-md ">
						<div className="flex justify-between gap-4 w-full items-center flex-wrap p-6">
							<CardHeader className="p-0">
								<CardTitle className="text-xl flex flex-row gap-2">
									<FolderInput className="size-6 text-muted-foreground self-center" />
									{t("dashboard.projects")}
								</CardTitle>
								<CardDescription>
									{t("project.list.description")}
								</CardDescription>
							</CardHeader>
							{(auth?.role === "owner" || auth?.canCreateProjects) && (
								<div className="">
									<HandleProject />
								</div>
							)}
						</div>

						<CardContent className="space-y-2 py-8 border-t gap-4 flex flex-col min-h-[60vh]">
							{isLoading ? (
								<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[60vh]">
									<span>{t("loading")}</span>
									<Loader2 className="animate-spin size-4" />
								</div>
							) : (
								<>
									<div className="flex max-sm:flex-col gap-4 items-center w-full">
										<div className="flex-1 relative max-sm:w-full">
											<FocusShortcutInput
												placeholder={t("project.filterPlaceholder")}
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
												className="pr-10"
											/>

											<Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
										</div>
										<div className="flex items-center gap-2 min-w-48 max-sm:w-full">
											<ArrowUpDown className="size-4 text-muted-foreground" />
											<Select value={sortBy} onValueChange={setSortBy}>
												<SelectTrigger className="w-full">
													<SelectValue
														placeholder={t("project.sort.placeholder")}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="name-asc">
														{t("project.sort.nameAsc")}
													</SelectItem>
													<SelectItem value="name-desc">
														{t("project.sort.nameDesc")}
													</SelectItem>
													<SelectItem value="createdAt-desc">
														{t("project.sort.newestFirst")}
													</SelectItem>
													<SelectItem value="createdAt-asc">
														{t("project.sort.oldestFirst")}
													</SelectItem>
													<SelectItem value="services-desc">
														{t("project.sort.mostServices")}
													</SelectItem>
													<SelectItem value="services-asc">
														{t("project.sort.leastServices")}
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
									{filteredProjects?.length === 0 && (
										<div className="mt-6 flex h-[50vh] w-full flex-col items-center justify-center space-y-4">
											<FolderInput className="size-8 self-center text-muted-foreground" />
											<span className="text-center font-medium text-muted-foreground">
												{t("project.empty")}
											</span>
										</div>
									)}
									<div className="w-full grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 flex-wrap gap-5">
										{filteredProjects?.map((project) => {
											const emptyServices = project?.environments
												.map(
													(env) =>
														env.applications.length === 0 &&
														env.mariadb.length === 0 &&
														env.mongo.length === 0 &&
														env.mysql.length === 0 &&
														env.postgres.length === 0 &&
														env.redis.length === 0 &&
														env.applications.length === 0 &&
														env.compose.length === 0,
												)
												.every(Boolean);

											const totalServices = project?.environments
												.map(
													(env) =>
														env.mariadb.length +
														env.mongo.length +
														env.mysql.length +
														env.postgres.length +
														env.redis.length +
														env.applications.length +
														env.compose.length,
												)
												.reduce((acc, curr) => acc + curr, 0);

											const haveServicesWithDomains = project?.environments
												.map(
													(env) =>
														env.applications.length > 0 ||
														env.compose.length > 0,
												)
												.some(Boolean);

											return (
												<div
													key={project.projectId}
													className="w-full lg:max-w-md"
												>
													<Link
														href={`/dashboard/project/${project.projectId}/environment/${project?.environments?.[0]?.environmentId}`}
													>
														<Card className="group relative w-full h-full bg-transparent transition-colors hover:bg-border">
															{haveServicesWithDomains ? (
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button
																			className="absolute -right-3 -top-3 size-9 translate-y-1 rounded-full p-0 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
																			size="sm"
																			variant="default"
																		>
																			<ExternalLinkIcon className="size-3.5" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent
																		className="w-[200px] space-y-2 overflow-y-auto max-h-[400px]"
																		onClick={(e) => e.stopPropagation()}
																	>
																		{project.environments.some(
																			(env) => env.applications.length > 0,
																		) && (
																			<DropdownMenuGroup>
																				<DropdownMenuLabel>
																					{t("project.applications")}
																				</DropdownMenuLabel>
																				{project.environments.map((env) =>
																					env.applications.map((app) => (
																						<div key={app.applicationId}>
																							<DropdownMenuSeparator />
																							<DropdownMenuGroup>
																								<DropdownMenuLabel className="font-normal capitalize text-xs flex items-center justify-between">
																									{app.name}
																									<StatusTooltip
																										status={
																											app.applicationStatus
																										}
																									/>
																								</DropdownMenuLabel>
																								<DropdownMenuSeparator />
																								{app.domains.map((domain) => (
																									<DropdownMenuItem
																										key={domain.domainId}
																										asChild
																									>
																										<Link
																											className="space-x-4 text-xs cursor-pointer justify-between"
																											target="_blank"
																											href={`${
																												domain.https
																													? "https"
																													: "http"
																											}://${domain.host}${
																												domain.path
																											}`}
																										>
																											<span className="truncate">
																												{domain.host}
																											</span>
																											<ExternalLinkIcon className="size-4 shrink-0" />
																										</Link>
																									</DropdownMenuItem>
																								))}
																							</DropdownMenuGroup>
																						</div>
																					)),
																				)}
																			</DropdownMenuGroup>
																		)}
																		{project.environments.some(
																			(env) => env.compose.length > 0,
																		) && (
																			<DropdownMenuGroup>
																				<DropdownMenuLabel>
																					{t("project.compose")}
																				</DropdownMenuLabel>
																				{project.environments.map((env) =>
																					env.compose.map((comp) => (
																						<div key={comp.composeId}>
																							<DropdownMenuSeparator />
																							<DropdownMenuGroup>
																								<DropdownMenuLabel className="font-normal capitalize text-xs flex items-center justify-between">
																									{comp.name}
																									<StatusTooltip
																										status={comp.composeStatus}
																									/>
																								</DropdownMenuLabel>
																								<DropdownMenuSeparator />
																								{comp.domains.map((domain) => (
																									<DropdownMenuItem
																										key={domain.domainId}
																										asChild
																									>
																										<Link
																											className="space-x-4 text-xs cursor-pointer justify-between"
																											target="_blank"
																											href={`${
																												domain.https
																													? "https"
																													: "http"
																											}://${domain.host}${
																												domain.path
																											}`}
																										>
																											<span className="truncate">
																												{domain.host}
																											</span>
																											<ExternalLinkIcon className="size-4 shrink-0" />
																										</Link>
																									</DropdownMenuItem>
																								))}
																							</DropdownMenuGroup>
																						</div>
																					)),
																				)}
																			</DropdownMenuGroup>
																		)}
																	</DropdownMenuContent>
																</DropdownMenu>
															) : null}
															<CardHeader>
																<CardTitle className="flex items-center justify-between gap-2">
																	<span className="flex flex-col gap-1.5">
																		<div className="flex items-center gap-2">
																			<BookIcon className="size-4 text-muted-foreground" />
																			<span className="text-base font-medium leading-none">
																				{project.name}
																			</span>
																		</div>

																		<span className="text-sm font-medium text-muted-foreground">
																			{project.description}
																		</span>
																	</span>
																	<div className="flex self-start space-x-1">
																		<DropdownMenu>
																			<DropdownMenuTrigger asChild>
																				<Button
																					variant="ghost"
																					size="icon"
																					className="px-2"
																				>
																					<MoreHorizontalIcon className="size-5" />
																				</Button>
																			</DropdownMenuTrigger>
																			<DropdownMenuContent
																				className="w-[200px] space-y-2 overflow-y-auto max-h-[280px]"
																				onClick={(e) => e.stopPropagation()}
																			>
																				<DropdownMenuLabel className="font-normal">
																					{t("project.actions")}
																				</DropdownMenuLabel>
																				<div
																					onClick={(e) => e.stopPropagation()}
																				>
																					<ProjectEnvironment
																						projectId={project.projectId}
																					/>
																				</div>
																				<div
																					onClick={(e) => e.stopPropagation()}
																				>
																					<HandleProject
																						projectId={project.projectId}
																					/>
																				</div>

																				<div
																					onClick={(e) => e.stopPropagation()}
																				>
																					{(auth?.role === "owner" ||
																						auth?.canDeleteProjects) && (
																						<AlertDialog>
																							<AlertDialogTrigger className="w-full">
																								<DropdownMenuItem
																									className="w-full cursor-pointer  space-x-3"
																									onSelect={(e) =>
																										e.preventDefault()
																									}
																								>
																									<TrashIcon className="size-4" />
																									<span>{t("button.delete")}</span>
																								</DropdownMenuItem>
																							</AlertDialogTrigger>
																							<AlertDialogContent>
																								<AlertDialogHeader>
																									<AlertDialogTitle>
																		{t("project.delete.confirmTitle")}
																	</AlertDialogTitle>
																									{!emptyServices ? (
																										<div className="flex flex-row gap-4 rounded-lg bg-yellow-50 p-2 dark:bg-yellow-950">
																											<AlertTriangle className="text-yellow-600 dark:text-yellow-400" />
																											<span className="text-sm text-yellow-600 dark:text-yellow-400">
																			{t("project.delete.activeServicesWarning")}
																		</span>
																										</div>
																									) : (
																										<AlertDialogDescription>
																			{t("common.actionCannotBeUndone")}
																		</AlertDialogDescription>
																									)}
																								</AlertDialogHeader>
																								<AlertDialogFooter>
																<AlertDialogCancel>
																	{t("button.cancel")}
																</AlertDialogCancel>
																<AlertDialogAction
																	disabled={!emptyServices}
																	onClick={async () => {
																		try {
																			await mutateAsync({
																				projectId: project.projectId,
																			});
																			toast.success(t("project.delete.success"));
																		} catch {
																			toast.error(t("project.delete.error"));
																		} finally {
																			utils.project.all.invalidate();
																		}
																	}}
																>
																	{t("button.delete")}
																</AlertDialogAction>
																								</AlertDialogFooter>
																							</AlertDialogContent>
																						</AlertDialog>
																					)}
																				</div>
																			</DropdownMenuContent>
																		</DropdownMenu>
																	</div>
																</CardTitle>
															</CardHeader>
															<CardFooter className="pt-4">
																<div className="space-y-1 text-sm flex flex-row justify-between max-sm:flex-wrap w-full gap-2 sm:gap-4">
																	<DateTooltip date={project.createdAt}>
																		{t("project.createdAt")}
																	</DateTooltip>
																	<span>
																		{totalServices}{" "}
																		{totalServices === 1
																			? t("project.service")
																			: t("project.services")}
																	</span>
																</div>
															</CardFooter>
														</Card>
													</Link>
												</div>
											);
										})}
									</div>
								</>
							)}
						</CardContent>
					</div>
				</Card>
			</div>
		</>
	);
};
