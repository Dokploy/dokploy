import {
	FolderInput,
	Loader2,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { TimeBadge } from "@/components/ui/time-badge";
import { api } from "@/utils/api";
import { useDebounce } from "@/utils/hooks/use-debounce";
import { useProjectsRepository } from "../../infrastructure/api/projects-api.repository";
import { EmptyProjectsState } from "../components/empty-projects-state";
import { HandleProject } from "../components/handle-project";
import { ProjectCard } from "../components/project-card";
import { ProjectsFilters } from "../components/projects-filters";

/**
 * Show projects container component.
 */
export const ShowProjects = () => {
	const router = useRouter();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	
	const projectsRepository = useProjectsRepository();
	const { data, isLoading, error } = projectsRepository.getAll();
	const { data: auth } = api.user.get.useQuery();

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

	useEffect(() => {
		localStorage.setItem("projectsSort", sortBy);
	}, [sortBy]);

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

		const filtered = data.filter(
			(project) =>
				project.name
					.toLowerCase()
					.includes(debouncedSearchQuery.toLowerCase()) ||
				project.description
					?.toLowerCase()
					.includes(debouncedSearchQuery.toLowerCase()),
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
	}, [data, debouncedSearchQuery, sortBy]);

	return (
		<>
			<BreadcrumbSidebar
				list={[{ name: "Projects", href: "/dashboard/projects" }]}
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
									Projects
								</CardTitle>
								<CardDescription>
									Create and manage your projects
								</CardDescription>
							</CardHeader>
							{(auth?.role === "owner" ||
								auth?.role === "admin" ||
								auth?.canCreateProjects) && (
								<div className="">
									<HandleProject />
								</div>
							)}
						</div>

						<CardContent className="space-y-2 py-8 border-t gap-4 flex flex-col min-h-[60vh]">
							{isLoading ? (
								<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[60vh]">
									<span>Loading...</span>
									<Loader2 className="animate-spin size-4" />
								</div>
							) : (
								<>
									<ProjectsFilters
										searchQuery={searchQuery}
										onSearchChange={setSearchQuery}
										sortBy={sortBy}
										onSortChange={setSortBy}
									/>

									{filteredProjects?.length === 0 && <EmptyProjectsState />}

									<div className="w-full grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 flex-wrap gap-5">
										{filteredProjects?.map((project) => (
											<ProjectCard 
												key={project.projectId}
												project={project}
												auth={auth}
											/>
										))}
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
