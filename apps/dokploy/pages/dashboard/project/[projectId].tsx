import { AddApplication } from "@dokploy/components/dashboard/project/add-application";
import { AddCompose } from "@dokploy/components/dashboard/project/add-compose";
import { AddDatabase } from "@dokploy/components/dashboard/project/add-database";
import { AddTemplate } from "@dokploy/components/dashboard/project/add-template";
import {
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@dokploy/components/icons/data-tools-icons";
import { DashboardLayout } from "@dokploy/components/layouts/dashboard-layout";
import { ProjectLayout } from "@dokploy/components/layouts/project-layout";
import { DateTooltip } from "@dokploy/components/shared/date-tooltip";
import { StatusTooltip } from "@dokploy/components/shared/status-tooltip";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
} from "@dokploy/components/ui/breadcrumb";
import { Button } from "@dokploy/components/ui/button";
import {
	Card,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@dokploy/components/ui/card";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@dokploy/components/ui/dropdown-menu";
import { appRouter } from "@dokploy/server/api/root";
import type { findProjectById } from "@dokploy/server/api/services/project";
import { validateRequest } from "@dokploy/server/auth/auth";
import { api } from "@dokploy/utils/api";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { CircuitBoard, FolderInput, GlobeIcon, PlusIcon } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { type ReactElement } from "react";
import superjson from "superjson";

export type Services = {
	name: string;
	type:
		| "mariadb"
		| "application"
		| "postgres"
		| "mysql"
		| "mongo"
		| "redis"
		| "compose";
	description?: string | null;
	id: string;
	createdAt: string;
	status?: "idle" | "running" | "done" | "error";
};

type Project = Awaited<ReturnType<typeof findProjectById>>;

export const extractServices = (data: Project | undefined) => {
	const applications: Services[] =
		data?.applications.map((item) => ({
			name: item.name,
			type: "application",
			id: item.applicationId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
		})) || [];

	const mariadb: Services[] =
		data?.mariadb.map((item) => ({
			name: item.name,
			type: "mariadb",
			id: item.mariadbId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
		})) || [];

	const postgres: Services[] =
		data?.postgres.map((item) => ({
			name: item.name,
			type: "postgres",
			id: item.postgresId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
		})) || [];

	const mongo: Services[] =
		data?.mongo.map((item) => ({
			name: item.name,
			type: "mongo",
			id: item.mongoId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
		})) || [];

	const redis: Services[] =
		data?.redis.map((item) => ({
			name: item.name,
			type: "redis",
			id: item.redisId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
		})) || [];

	const mysql: Services[] =
		data?.mysql.map((item) => ({
			name: item.name,
			type: "mysql",
			id: item.mysqlId,
			createdAt: item.createdAt,
			status: item.applicationStatus,
			description: item.description,
		})) || [];

	const compose: Services[] =
		data?.compose.map((item) => ({
			name: item.name,
			type: "compose",
			id: item.composeId,
			createdAt: item.createdAt,
			status: item.composeStatus,
			description: item.description,
		})) || [];

	applications.push(
		...mysql,
		...redis,
		...mongo,
		...postgres,
		...mariadb,
		...compose,
	);

	applications.sort((a, b) => {
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});

	return applications;
};

const Project = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { projectId } = props;
	const { data: auth } = api.auth.get.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: auth?.id || "",
		},
		{
			enabled: !!auth?.id && auth?.rol === "user",
		},
	);
	const { data } = api.project.one.useQuery({ projectId });
	const router = useRouter();

	const emptyServices =
		data?.mariadb?.length === 0 &&
		data?.mongo?.length === 0 &&
		data?.mysql?.length === 0 &&
		data?.postgres?.length === 0 &&
		data?.redis?.length === 0 &&
		data?.applications?.length === 0 &&
		data?.compose?.length === 0;

	const applications = extractServices(data);

	return (
		<div>
			<div className="flex flex-col gap-4">
				<Breadcrumb>
					<BreadcrumbItem>
						<BreadcrumbLink as={Link} href="/dashboard/projects">
							Projects
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbItem isCurrentPage>
						<BreadcrumbLink>{data?.name}</BreadcrumbLink>
					</BreadcrumbItem>
				</Breadcrumb>
				<header className="mb-6 flex w-full items-center justify-between flex-wrap gap-2">
					<div className="flex flex-col gap-2">
						<h1 className="text-xl font-bold lg:text-3xl">{data?.name}</h1>

						<p className="lg:text-medium text-muted-foreground">
							{data?.description}
						</p>
					</div>

					{(auth?.rol === "admin" || user?.canCreateServices) && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button>
									<PlusIcon className="h-4 w-4" />
									Create Service
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-[200px] space-y-2" align="end">
								<DropdownMenuLabel className="text-sm font-normal ">
									Actions
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<AddApplication
									projectId={projectId}
									projectName={data?.name}
								/>
								<AddDatabase projectId={projectId} projectName={data?.name} />
								<AddCompose projectId={projectId} projectName={data?.name} />
								<AddTemplate projectId={projectId} />
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</header>
			</div>

			<div className="flex w-full gap-8 ">
				{emptyServices ? (
					<div className="flex h-[70vh] w-full flex-col items-center justify-center">
						<FolderInput className="size-10 md:size-28 text-muted" />
						<span className="text-center font-medium  text-muted-foreground">
							No services added yet. Click on Create Service.
						</span>
					</div>
				) : (
					<div className="flex w-full flex-col gap-4">
						<div className="grid gap-5 pb-10 sm:grid-cols-2 lg:grid-cols-3">
							{applications?.map((service) => (
								<Card
									key={service.id}
									onClick={() => {
										router.push(
											`/dashboard/project/${projectId}/services/${service.type}/${service.id}`,
										);
									}}
									className="group relative cursor-pointer bg-transparent transition-colors hover:bg-card h-fit"
								>
									<div className="absolute -right-1 -top-2">
										<StatusTooltip status={service.status} />
									</div>

									<CardHeader>
										<CardTitle className="flex items-center justify-between">
											<div className="flex flex-row items-center gap-2 justify-between w-full">
												<div className="flex flex-col gap-2">
													<span className="text-base flex items-center gap-2 font-medium leading-none flex-wrap">
														{service.name}
													</span>
													{service.description && (
														<span className="text-sm font-medium text-muted-foreground">
															{service.description}
														</span>
													)}
												</div>

												<span className="text-sm font-medium text-muted-foreground self-start">
													{service.type === "postgres" && (
														<PostgresqlIcon className="h-7 w-7" />
													)}
													{service.type === "redis" && (
														<RedisIcon className="h-7 w-7" />
													)}
													{service.type === "mariadb" && (
														<MariadbIcon className="h-7 w-7" />
													)}
													{service.type === "mongo" && (
														<MongodbIcon className="h-7 w-7" />
													)}
													{service.type === "mysql" && (
														<MysqlIcon className="h-7 w-7" />
													)}
													{service.type === "application" && (
														<GlobeIcon className="h-6 w-6" />
													)}
													{service.type === "compose" && (
														<CircuitBoard className="h-6 w-6" />
													)}
												</span>
											</div>
										</CardTitle>
									</CardHeader>
									<CardFooter className="">
										<div className="space-y-1 text-sm">
											<DateTooltip date={service.createdAt}>
												Created
											</DateTooltip>
										</div>
									</CardFooter>
								</Card>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default Project;
Project.getLayout = (page: ReactElement) => {
	return <ProjectLayout>{page}</ProjectLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ projectId: string }>,
) {
	const { params } = ctx;

	const { req, res } = ctx;
	const { user, session } = await validateRequest(req, res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	// Fetch data from external API
	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session,
			user: user,
		},
		transformer: superjson,
	});

	// Valid project, if not return to initial homepage....
	if (typeof params?.projectId === "string") {
		try {
			await helpers.project.one.fetch({
				projectId: params?.projectId,
			});
			return {
				props: {
					trpcState: helpers.dehydrate(),
					projectId: params?.projectId,
				},
			};
		} catch (error) {
			return {
				redirect: {
					permanent: false,
					destination: "/",
				},
			};
		}
	}

	return {
		redirect: {
			permanent: false,
			destination: "/",
		},
	};
}
