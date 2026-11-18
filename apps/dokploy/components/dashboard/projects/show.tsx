import {
	AlertTriangle,
	ArrowUpDown,
	BookIcon,
	FolderInput,
	Loader2,
	MoreHorizontalIcon,
	Search,
	TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { FocusShortcutInput } from "@/components/shared/focus-shortcut-input";
import { TagBadge } from "@/components/shared/tag-badge";
import { TagFilter } from "@/components/shared/tag-filter";
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
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { useDebounce } from "@/utils/hooks/use-debounce";
import { ExportProject } from "../project/export-import/export-project";
import { ImportProject } from "../project/export-import/import-project";
import { HandleProject } from "./handle-project";
import { ProjectEnvironment } from "./project-environment";

export const ShowProjects = () => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const router = useRouter();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data, isPending } = api.project.all.useQuery();
	const { data: auth } = api.user.get.useQuery();
	const canTransfer = auth?.role === "owner" || auth?.role === "admin";
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { mutateAsync } = api.project.remove.useMutation();
	const { data: availableTags } = api.tag.all.useQuery();

	const [searchQuery, setSearchQuery] = useState(
		router.isReady && typeof router.query.q === "string" ? router.query.q : "",
	);
	const debouncedSearchQuery = useDebounce(searchQuery, 500);

	const [sortBy, setSortBy] = useState<string>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("projectsSort") || "createdAt-desc";
		}
		return "createdAt-desc";
	});

	const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("projectsTagFilter");
			return saved ? JSON.parse(saved) : [];
		}
		return [];
	});

	useEffect(() => {
		localStorage.setItem("projectsSort", sortBy);
	}, [sortBy]);

	useEffect(() => {
		localStorage.setItem("projectsTagFilter", JSON.stringify(selectedTagIds));
	}, [selectedTagIds]);

	useEffect(() => {
		if (!availableTags) return;
		const validIds = new Set(availableTags.map((t) => t.tagId));
		setSelectedTagIds((prev) => {
			const filtered = prev.filter((id) => validIds.has(id));
			return filtered.length === prev.length ? prev : filtered;
		});
	}, [availableTags]);

	useEffect(() => {
		if (!router.isReady) return;
		const urlQuery = typeof router.query.q === "string" ? router.query.q : "";
		if (urlQuery !== searchQuery) {
			setSearchQuery(urlQuery);
		}
	}, [router.isReady, router.query.q]);

	useEffect(() => {
		if (!router.isReady) return;
		const urlQuery = typeof router.query.q === "string" ? router.query.q : "";
		if (debouncedSearchQuery === urlQuery) return;

		const newQuery = { ...router.query };
		if (debouncedSearchQuery) {
			newQuery.q = debouncedSearchQuery;
		} else {
			delete newQuery.q;
		}
		router.replace({ pathname: router.pathname, query: newQuery }, undefined, {
			shallow: true,
		});
	}, [debouncedSearchQuery]);

	const filteredProjects = useMemo(() => {
		if (!data) return [];

		let filtered = data.filter(
			(project) =>
				project.name
					.toLowerCase()
					.includes(debouncedSearchQuery.toLowerCase()) ||
				project.description
					?.toLowerCase()
					.includes(debouncedSearchQuery.toLowerCase()),
		);

		// Filter by selected tags (OR logic: show projects with ANY selected tag)
		if (selectedTagIds.length > 0) {
			filtered = filtered.filter((project) =>
				project.projectTags?.some((pt) =>
					selectedTagIds.includes(pt.tag.tagId),
				),
			);
		}

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
							(env.libsql?.length || 0) +
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
							(env.libsql?.length || 0) +
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
	}, [data, debouncedSearchQuery, sortBy, selectedTagIds]);

	return (
		<>
			<BreadcrumbSidebar
				list={[{ name: t("projects.breadcrumb"), href: "/dashboard/projects" }]}
			/>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl  ">
					<div className="rounded-xl bg-background shadow-md ">
						<div className="flex justify-between gap-4 w-full items-center flex-wrap p-6">
							<CardHeader className="flex-1 p-0">
								<CardTitle className="text-xl flex flex-row gap-2">
									<FolderInput className="size-6 text-muted-foreground self-center" />
									{t("projects.title")}
								</CardTitle>
								<CardDescription>{t("projects.description")}</CardDescription>
							</CardHeader>
							{permissions?.project.create && (
								<div className="flex gap-2">
									{canTransfer && <ImportProject />}
									<HandleProject />
								</div>
							)}
						</div>

						<CardContent className="space-y-2 py-8 border-t gap-4 flex flex-col min-h-[60vh]">
							{isPending ? (
								<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[60vh]">
									<span>{t("projects.loading")}</span>
									<Loader2 className="animate-spin size-4" />
								</div>
							) : (
								<>
									<div className="flex max-sm:flex-col gap-4 items-center w-full">
										<div className="flex-1 relative max-sm:w-full">
											<FocusShortcutInput
												placeholder={t("projects.filterPlaceholder")}
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
												autoComplete="off"
												className="pr-10"
											/>

											<Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
										</div>
										<div className="flex items-center gap-2">
											<TagFilter
												tags={
													availableTags?.map((tag) => ({
														id: tag.tagId,
														name: tag.name,
														color: tag.color || undefined,
													})) || []
												}
												selectedTags={selectedTagIds}
												onTagsChange={setSelectedTagIds}
											/>
											<div className="flex items-center gap-2 min-w-48 max-sm:w-full">
												<ArrowUpDown className="size-4 text-muted-foreground" />
												<Select value={sortBy} onValueChange={setSortBy}>
													<SelectTrigger className="w-full">
														<SelectValue
															placeholder={t("projects.sort.placeholder")}
														/>
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="name-asc">
															{t("projects.sort.nameAsc")}
														</SelectItem>
														<SelectItem value="name-desc">
															{t("projects.sort.nameDesc")}
														</SelectItem>
														<SelectItem value="createdAt-desc">
															{t("projects.sort.newest")}
														</SelectItem>
														<SelectItem value="createdAt-asc">
															{t("projects.sort.oldest")}
														</SelectItem>
														<SelectItem value="services-desc">
															{t("projects.sort.mostServices")}
														</SelectItem>
														<SelectItem value="services-asc">
															{t("projects.sort.leastServices")}
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
									</div>
									{filteredProjects?.length === 0 && (
										<div className="mt-6 flex h-[50vh] w-full flex-col items-center justify-center space-y-4">
											<FolderInput className="size-8 self-center text-muted-foreground" />
											<span className="text-center font-medium text-muted-foreground">
												{t("projects.empty")}
											</span>
										</div>
									)}
									<div className="w-full grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
										{filteredProjects?.map((project) => {
											const emptyServices = project?.environments
												.map(
													(env) =>
														env.applications.length === 0 &&
														env.compose.length === 0 &&
														env.libsql.length === 0 &&
														env.mariadb.length === 0 &&
														env.mongo.length === 0 &&
														env.mysql.length === 0 &&
														env.postgres.length === 0 &&
														env.redis.length === 0,
												)
												.every(Boolean);

											const totalServices = project?.environments
												.map(
													(env) =>
														env.applications.length +
														env.compose.length +
														env.libsql.length +
														env.mariadb.length +
														env.mongo.length +
														env.mysql.length +
														env.postgres.length +
														env.redis.length,
												)
												.reduce((acc, curr) => acc + curr, 0);

											// Find default environment from accessible environments, or fall back to first accessible environment
											const accessibleEnvironment =
												project?.environments.find((env) => env.isDefault) ||
												project?.environments?.[0];

											const hasNoEnvironments = !accessibleEnvironment;

											return (
												<div
													key={project.projectId}
													className="w-full lg:max-w-md"
												>
													<Link
														href={
															hasNoEnvironments
																? "#"
																: `/dashboard/project/${project.projectId}/environment/${accessibleEnvironment?.environmentId}`
														}
														onClick={(e) => {
															if (hasNoEnvironments) {
																e.preventDefault();
															}
														}}
													>
														<Card className="group relative w-full h-full bg-transparent transition-colors hover:bg-border flex flex-col">
															<CardHeader>
																<CardTitle className="flex items-center justify-between gap-2 overflow-clip">
																	<span className="flex flex-col gap-1.5 ">
																		<div className="flex items-center gap-2">
																			<BookIcon className="size-4 text-muted-foreground" />
																			<span className="text-base font-medium leading-none">
																				{project.name}
																			</span>
																		</div>

																		<span className="text-sm font-medium text-muted-foreground break-normal">
																			{project.description}
																		</span>

																		{project.projectTags &&
																			project.projectTags.length > 0 && (
																				<div className="flex flex-wrap gap-1.5 mt-2">
																					{project.projectTags.map((pt) => (
																						<TagBadge
																							key={pt.tag.tagId}
																							name={pt.tag.name}
																							color={pt.tag.color}
																						/>
																					))}
																				</div>
																			)}

																		{hasNoEnvironments && (
																			<div className="flex flex-row gap-2 items-center rounded-lg bg-yellow-50 p-2 mt-2 dark:bg-yellow-950">
																				<AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
																				<span className="text-xs text-yellow-600 dark:text-yellow-400">
																					{t("projects.noEnvironmentsWarning")}
																				</span>
																			</div>
																		)}
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
																					{t("projects.actions")}
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
																					{canTransfer && (
																						<ExportProject
																							projectId={project.projectId}
																							environments={
																								project.environments
																							}
																						/>
																					)}
																				</div>

																				<div
																					onClick={(e) => e.stopPropagation()}
																				>
																					{permissions?.project.delete && (
																						<AlertDialog>
																							<AlertDialogTrigger className="w-full">
																								<DropdownMenuItem
																									className="w-full cursor-pointer  space-x-3"
																									onSelect={(e) =>
																										e.preventDefault()
																									}
																								>
																									<TrashIcon className="size-4" />
																									<span>
																										{t("projects.delete")}
																									</span>
																								</DropdownMenuItem>
																							</AlertDialogTrigger>
																							<AlertDialogContent>
																								<AlertDialogHeader>
																									<AlertDialogTitle>
																										{t(
																											"projects.deleteConfirmTitle",
																										)}
																									</AlertDialogTitle>
																									{!emptyServices ? (
																										<div className="flex flex-row gap-4 rounded-lg bg-yellow-50 p-2 dark:bg-yellow-950">
																											<AlertTriangle className="text-yellow-600 dark:text-yellow-400" />
																											<span className="text-sm text-yellow-600 dark:text-yellow-400">
																												{t(
																													"projects.activeServicesWarning",
																												)}
																											</span>
																										</div>
																									) : (
																										<AlertDialogDescription>
																											{t(
																												"projects.deleteConfirmDescription",
																											)}
																										</AlertDialogDescription>
																									)}
																								</AlertDialogHeader>
																								<AlertDialogFooter>
																									<AlertDialogCancel>
																										{t("projects.cancel")}
																									</AlertDialogCancel>
																									<AlertDialogAction
																										disabled={!emptyServices}
																										onClick={async () => {
																											await mutateAsync({
																												projectId:
																													project.projectId,
																											})
																												.then(() => {
																													toast.success(
																														t(
																															"projects.deleteSuccess",
																														),
																													);
																												})
																												.catch(() => {
																													toast.error(
																														t(
																															"projects.deleteError",
																														),
																													);
																												})
																												.finally(() => {
																													utils.project.all.invalidate();
																												});
																										}}
																									>
																										{t("projects.delete")}
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
															<CardFooter className="pt-4 mt-auto">
																<div className="space-y-1 text-xs flex flex-row justify-between max-sm:flex-wrap w-full gap-2 sm:gap-4">
																	<DateTooltip date={project.createdAt}>
																		{t("projects.created")}
																	</DateTooltip>
																	<span>
																		{t("projects.servicesCount", {
																			count: totalServices,
																		})}
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
