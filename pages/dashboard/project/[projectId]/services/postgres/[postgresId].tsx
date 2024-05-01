import { ShowAdvancedPostgres } from "@/components/dashboard/postgres/advanced/show-postgres-advanced-settings";
import { ShowBackupPostgres } from "@/components/dashboard/postgres/backups/show-backup-postgres";
import { DeletePostgres } from "@/components/dashboard/postgres/delete-postgres";
import { ShowPostgresEnviroment } from "@/components/dashboard/postgres/enviroment/show-postgres-enviroment";
import { ShowExternalPostgresCredentials } from "@/components/dashboard/postgres/general/show-external-postgres-credentials";
import { ShowGeneralPostgres } from "@/components/dashboard/postgres/general/show-general-postgres";
import { ShowInternalPostgresCredentials } from "@/components/dashboard/postgres/general/show-internal-postgres-credentials";
import { PostgresqlIcon } from "@/components/icons/data-tools-icons";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRouter } from "@/server/api/root";
import { validateRequest } from "@/server/auth/auth";
import { api } from "@/utils/api";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, type ReactElement } from "react";
import superjson from "superjson";
import { DockerMonitoring } from "@/components/dashboard/monitoring/docker/show";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { ShowDockerLogs } from "@/components/dashboard/application/logs/show";
import { UpdatePostgres } from "@/components/dashboard/postgres/update-postgres";
import { ProjectLayout } from "@/components/layouts/project-layout";

type TabState = "projects" | "monitoring" | "settings" | "backups" | "advanced";

const Postgresql = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { postgresId, activeTab } = props;
	const router = useRouter();
	const { projectId } = router.query;
	const [tab, setSab] = useState<TabState>(activeTab);
	const { data } = api.postgres.one.useQuery({ postgresId });
	const { data: auth } = api.auth.get.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: auth?.id || "",
		},
		{
			enabled: !!auth?.id && auth?.rol === "user",
		},
	);

	return (
		<div className="pb-10">
			<div className="flex flex-col gap-4">
				<Breadcrumb>
					<BreadcrumbItem>
						<BreadcrumbLink as={Link} href="/dashboard/projects">
							Projects
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbItem>
						<BreadcrumbLink
							as={Link}
							href={`/dashboard/project/${data?.project.projectId}`}
						>
							{data?.project.name}
						</BreadcrumbLink>
					</BreadcrumbItem>

					<BreadcrumbItem isCurrentPage>
						<BreadcrumbLink>{data?.name}</BreadcrumbLink>
					</BreadcrumbItem>
				</Breadcrumb>
				<header className="mb-6 flex w-full items-center justify-between max-sm:flex-wrap gap-4">
					<div className="flex  flex-col justify-between w-fit gap-2">
						<div className="flex flex-row items-center gap-2 xl:gap-4 flex-wrap">
							<h1 className="flex items-center gap-2 text-xl font-bold lg:text-3xl">
								{data?.name}
							</h1>
							<span className="text-sm">{data?.appName}</span>
						</div>

						{data?.description && (
							<p className="text-sm text-muted-foreground  max-w-6xl">
								{data?.description}
							</p>
						)}
					</div>
					<div className="relative flex flex-row gap-4">
						<div className="absolute -right-1  -top-2">
							<StatusTooltip status={data?.applicationStatus} />
						</div>

						<PostgresqlIcon className="h-8 w-8 text-muted-foreground" />
					</div>
				</header>
			</div>
			<Tabs
				value={tab}
				defaultValue="general"
				className="w-full"
				onValueChange={(e) => {
					setSab(e as TabState);
					const newPath = `/dashboard/project/${projectId}/services/postgres/${postgresId}?tab=${e}`;

					router.push(newPath, undefined, { shallow: true });
				}}
			>
				<div className="flex flex-row items-center justify-between  w-full gap-4">
					<TabsList className="md:grid md:w-fit md:grid-cols-6 max-md:overflow-y-scroll justify-start">
						<TabsTrigger value="general">General</TabsTrigger>
						<TabsTrigger value="enviroment">Enviroment</TabsTrigger>
						<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
						<TabsTrigger value="backups">Backups</TabsTrigger>
						<TabsTrigger value="logs">Logs</TabsTrigger>
						<TabsTrigger value="advanced">Advanced</TabsTrigger>
					</TabsList>

					<div className="flex flex-row gap-4">
						<UpdatePostgres postgresId={postgresId} />
						{(auth?.rol === "admin" || user?.canDeleteServices) && (
							<DeletePostgres postgresId={postgresId} />
						)}
					</div>
				</div>

				<TabsContent value="general">
					<div className="flex flex-col gap-4 pt-2.5">
						<ShowGeneralPostgres postgresId={postgresId} />
						<ShowInternalPostgresCredentials postgresId={postgresId} />
						<ShowExternalPostgresCredentials postgresId={postgresId} />
					</div>
				</TabsContent>
				<TabsContent value="enviroment">
					<div className="flex flex-col gap-4 pt-2.5">
						<ShowPostgresEnviroment postgresId={postgresId} />
					</div>
				</TabsContent>
				<TabsContent value="monitoring">
					<div className="flex flex-col gap-4 pt-2.5">
						<DockerMonitoring appName={data?.appName || ""} />
					</div>
				</TabsContent>
				<TabsContent value="logs">
					<div className="flex flex-col gap-4  pt-2.5">
						<ShowDockerLogs appName={data?.appName || ""} />
					</div>
				</TabsContent>
				<TabsContent value="backups">
					<div className="flex flex-col gap-4 pt-2.5">
						<ShowBackupPostgres postgresId={postgresId} />
					</div>
				</TabsContent>
				<TabsContent value="advanced">
					<div className="flex flex-col gap-4 pt-2.5">
						<ShowAdvancedPostgres postgresId={postgresId} />
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
};

export default Postgresql;
Postgresql.getLayout = (page: ReactElement) => {
	return <ProjectLayout>{page}</ProjectLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ postgresId: string; activeTab: TabState }>,
) {
	const { query, params, req, res } = ctx;
	const activeTab = query.tab;
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

	if (typeof params?.postgresId === "string") {
		try {
			await helpers.postgres.one.fetch({
				postgresId: params?.postgresId,
			});

			return {
				props: {
					trpcState: helpers.dehydrate(),
					postgresId: params?.postgresId,
					activeTab: (activeTab || "general") as TabState,
				},
			};
		} catch (error) {
			return {
				redirect: {
					permanent: false,
					destination: "/dashboard/projects",
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
