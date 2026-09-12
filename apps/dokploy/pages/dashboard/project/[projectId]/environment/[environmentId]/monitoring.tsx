import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";
import { validateRequest } from "@dokploy/server/lib/auth";
import { hasPermission } from "@dokploy/server/services/permission";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { Activity, ArrowLeft, FolderInput } from "lucide-react";
import superjson from "superjson";
import { AdvancedEnvironmentSelector } from "@/components/dashboard/project/advanced-environment-selector";
import { extractServicesFromEnvironment } from "@/components/dashboard/project/extract-services";
import { ProjectMonitoring } from "@/components/dashboard/project/monitoring/project-monitoring";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AdvanceBreadcrumb } from "@/components/shared/advance-breadcrumb";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { useWhitelabeling } from "@/utils/hooks/use-whitelabeling";

const ProjectMonitoringPage = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { projectId, environmentId } = props;
	const { config: whitelabeling } = useWhitelabeling();
	const appName = whitelabeling?.appName || "Dokploy";

	const { data: currentEnvironment } = api.environment.one.useQuery({
		environmentId,
	});

	const services = extractServicesFromEnvironment(currentEnvironment);

	return (
		<div>
			<AdvanceBreadcrumb />
			<Head>
				<title>
					Monitoring | {currentEnvironment?.name} |{" "}
					{currentEnvironment?.project?.name} | {appName}
				</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl">
					<div className="rounded-xl bg-background shadow-md">
						<div className="flex items-start justify-between gap-6 w-full p-6 border-b">
							<CardHeader className="p-0 space-y-3 min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
									<FolderInput className="size-5 text-muted-foreground shrink-0" />
									<p className="text-sm font-medium text-muted-foreground truncate max-w-[220px]">
										{currentEnvironment?.project?.name}
									</p>
									<AdvancedEnvironmentSelector
										projectId={projectId}
										currentEnvironmentId={environmentId}
									/>
								</div>
								<div className="space-y-1.5">
									<CardTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2">
										<Activity className="size-5 text-muted-foreground" />
										Monitoring
									</CardTitle>
									<CardDescription className="text-sm leading-relaxed max-w-2xl">
										Aggregated container metrics for this environment. Select
										the services you want to watch — charts match the service
										monitoring tab.
									</CardDescription>
								</div>
							</CardHeader>
							<Button variant="outline" className="shrink-0" asChild>
								<Link
									href={`/dashboard/project/${projectId}/environment/${environmentId}`}
								>
									<ArrowLeft className="size-4 mr-1" />
									Back to services
								</Link>
							</Button>
						</div>

						<div className="p-6">
							<ProjectMonitoring
								projectId={projectId}
								environmentId={environmentId}
								services={services}
							/>
						</div>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default ProjectMonitoringPage;

ProjectMonitoringPage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ projectId: string; environmentId: string }>,
) {
	const { params, req, res } = ctx;
	const { user, session } = await validateRequest(req);

	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}

	const canView = await hasPermission(
		{
			user: { id: user.id },
			session: { activeOrganizationId: session?.activeOrganizationId || "" },
		},
		{ monitoring: ["read"] },
	);

	if (!canView) {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/home",
			},
		};
	}

	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});

	if (
		typeof params?.projectId === "string" &&
		typeof params?.environmentId === "string"
	) {
		try {
			await helpers.project.one.fetch({
				projectId: params.projectId,
			});
			await helpers.environment.one.fetch({
				environmentId: params.environmentId,
			});
			await helpers.settings.isCloud.prefetch();

			return {
				props: {
					trpcState: helpers.dehydrate(),
					projectId: params.projectId,
					environmentId: params.environmentId,
				},
			};
		} catch {
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
