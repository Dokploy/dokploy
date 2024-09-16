import { ShowClusterSettings } from "@/components/dashboard/application/advanced/cluster/show-cluster-settings";
import { AddCommand } from "@/components/dashboard/application/advanced/general/add-command";
import { ShowPorts } from "@/components/dashboard/application/advanced/ports/show-port";
import { ShowRedirects } from "@/components/dashboard/application/advanced/redirects/show-redirects";
import { ShowSecurity } from "@/components/dashboard/application/advanced/security/show-security";
import { ShowApplicationResources } from "@/components/dashboard/application/advanced/show-application-advanced-settings";
import { ShowTraefikConfig } from "@/components/dashboard/application/advanced/traefik/show-traefik-config";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { DeleteApplication } from "@/components/dashboard/application/delete-application";
import { ShowDeployments } from "@/components/dashboard/application/deployments/show-deployments";
import { ShowDomains } from "@/components/dashboard/application/domains/show-domains";
import { ShowEnvironment } from "@/components/dashboard/application/environment/show";
import { ShowGeneralApplication } from "@/components/dashboard/application/general/show";
import { ShowDockerLogs } from "@/components/dashboard/application/logs/show";
import { UpdateApplication } from "@/components/dashboard/application/update-application";
import { DockerMonitoring } from "@/components/dashboard/monitoring/docker/show";
import { ProjectLayout } from "@/components/layouts/project-layout";
import { StatusTooltip } from "@/components/shared/status-tooltip";
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
import { GlobeIcon } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, type ReactElement } from "react";
import superjson from "superjson";

type TabState =
	| "projects"
	| "settings"
	| "advanced"
	| "deployments"
	| "domains"
	| "monitoring";

const Service = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { applicationId, activeTab } = props;
	const router = useRouter();
	const { projectId } = router.query;
	const [tab, setSab] = useState<TabState>(activeTab);
	const { data } = api.application.one.useQuery(
		{ applicationId },
		{
			refetchInterval: 5000,
		},
	);

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
							<p className="text-sm text-muted-foreground max-w-6xl">
								{data?.description}
							</p>
						)}
					</div>
					<div className="relative flex flex-row gap-4">
						<div className="absolute -right-1  -top-2">
							<StatusTooltip status={data?.applicationStatus} />
						</div>

						<GlobeIcon className="h-6 w-6 text-muted-foreground" />
					</div>
				</header>
			</div>
			<Tabs
				value={tab}
				defaultValue="general"
				className="w-full"
				onValueChange={(e) => {
					setSab(e as TabState);
					const newPath = `/dashboard/project/${projectId}/services/application/${applicationId}?tab=${e}`;
					router.push(newPath, undefined, { shallow: true });
				}}
			>
				<div className="flex flex-row items-center justify-between  w-full gap-4">
					<TabsList className="md:grid md:w-fit md:grid-cols-7 max-md:overflow-y-scroll justify-start">
						<TabsTrigger value="general">General</TabsTrigger>
						<TabsTrigger value="environment">Environment</TabsTrigger>
						<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
						<TabsTrigger value="logs">Logs</TabsTrigger>
						<TabsTrigger value="deployments">Deployments</TabsTrigger>
						<TabsTrigger value="domains">Domains</TabsTrigger>
						<TabsTrigger value="advanced">Advanced</TabsTrigger>
					</TabsList>
					<div className="flex flex-row gap-2">
						<UpdateApplication applicationId={applicationId} />
						{(auth?.rol === "admin" || user?.canDeleteServices) && (
							<DeleteApplication applicationId={applicationId} />
						)}
					</div>
				</div>

				<TabsContent value="general">
					<div className="flex flex-col gap-4 pt-2.5">
						<ShowGeneralApplication applicationId={applicationId} />
					</div>
				</TabsContent>
				<TabsContent value="environment">
					<div className="flex flex-col gap-4 pt-2.5">
						<ShowEnvironment applicationId={applicationId} />
					</div>
				</TabsContent>
				<TabsContent value="monitoring">
					<div className="flex flex-col gap-4 pt-2.5">
						<DockerMonitoring
							appName={data?.appName || ""}
							serverId={data?.serverId || ""}
						/>
					</div>
				</TabsContent>
				<TabsContent value="logs">
					<div className="flex flex-col gap-4  pt-2.5">
						<ShowDockerLogs
							appName={data?.appName || ""}
							serverId={data?.serverId || ""}
						/>
					</div>
				</TabsContent>
				<TabsContent value="deployments" className="w-full">
					<div className="flex flex-col gap-4 pt-2.5">
						<ShowDeployments applicationId={applicationId} />
					</div>
				</TabsContent>
				<TabsContent value="domains" className="w-full">
					<div className="flex flex-col gap-4 pt-2.5">
						<ShowDomains applicationId={applicationId} />
					</div>
				</TabsContent>
				<TabsContent value="advanced">
					<div className="flex flex-col gap-4 pt-2.5">
						<AddCommand applicationId={applicationId} />
						<ShowClusterSettings applicationId={applicationId} />
						<ShowApplicationResources applicationId={applicationId} />
						<ShowVolumes applicationId={applicationId} />
						<ShowRedirects applicationId={applicationId} />
						<ShowSecurity applicationId={applicationId} />
						<ShowPorts applicationId={applicationId} />
						<ShowTraefikConfig applicationId={applicationId} />
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
};

export default Service;
Service.getLayout = (page: ReactElement) => {
	return <ProjectLayout>{page}</ProjectLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{
		applicationId: string;
		activeTab: TabState;
	}>,
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

	// Valid project, if not return to initial homepage....
	if (typeof params?.applicationId === "string") {
		try {
			await helpers.application.one.fetch({
				applicationId: params?.applicationId,
			});

			return {
				props: {
					trpcState: helpers.dehydrate(),
					applicationId: params?.applicationId,
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
