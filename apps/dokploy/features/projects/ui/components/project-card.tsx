import {
	BookIcon,
	ExternalLinkIcon,
	MoreHorizontalIcon,
} from "lucide-react";
import Link from "next/link";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Button } from "@/components/ui/button";
import {
	Card,
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
import type { Project } from "../../domain/models/project.models";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { HandleProject } from "./handle-project";
import { ProjectEnvironment } from "./project-environment";

interface Props {
	project: Project;
	auth: any;
}

/**
 * Project card component.
 */
export const ProjectCard = ({ project, auth }: Props) => {
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

	const productionEnvironment = project?.environments.find(
		(env) => env.isDefault,
	);

	return (
		<div className="w-full lg:max-w-md">
			<Link
				href={`/dashboard/project/${project.projectId}/environment/${productionEnvironment?.environmentId}`}
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
											Applications
										</DropdownMenuLabel>
										{project.environments.map((env) =>
											env.applications.map((app) => (
												<div key={app.applicationId}>
													<DropdownMenuSeparator />
													<DropdownMenuGroup>
														<DropdownMenuLabel className="font-normal capitalize text-xs flex items-center justify-between">
															{app.name}
															<StatusTooltip
																status={app.applicationStatus}
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
											Compose
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
											Actions
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
												<DeleteProjectDialog
													projectId={project.projectId}
													emptyServices={emptyServices}
												/>
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
								Created
							</DateTooltip>
							<span>
								{totalServices}{" "}
								{totalServices === 1
									? "service"
									: "services"}
							</span>
						</div>
					</CardFooter>
				</Card>
			</Link>
		</div>
	);
};