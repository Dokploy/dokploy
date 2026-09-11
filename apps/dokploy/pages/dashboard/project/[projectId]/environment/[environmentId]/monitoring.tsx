import type { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";
import { validateRequest } from "@dokploy/server/lib/auth";
import { hasPermission } from "@dokploy/server/services/permission";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { ArrowLeft, FolderInput } from "lucide-react";
import superjson from "superjson";
import { AdvancedEnvironmentSelector } from "@/components/dashboard/project/advanced-environment-selector";
import { extractServicesFromEnvironment } from "@/components/dashboard/project/extract-services";
import { ProjectMonitoring } from "@/components/dashboard/project/monitoring/project-monitoring";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
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
		<div className="w-full">
			<Head>
				<title>
					Monitoring | {currentEnvironment?.name} |{" "}
					{currentEnvironment?.project?.name} | {appName}
				</title>
			</Head>
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<div className="flex justify-between gap-4 w-full items-center flex-wrap p-6 border-b">
						<CardHeader className="p-0">
							<CardTitle className="text-xl flex flex-row gap-2 items-center flex-wrap">
								<FolderInput className="size-6 text-muted-foreground self-center" />
								<p className="text-base font-medium max-w-[250px] truncate">
									{currentEnvironment?.project?.name}
								</p>
								<AdvancedEnvironmentSelector
									projectId={projectId}
									currentEnvironmentId={environmentId}
								/>
							</CardTitle>
							<CardDescription>
								Aggregated container metrics for this environment
							</CardDescription>
						</CardHeader>
						<Button variant="outline" asChild>
							<Link
								href={`/dashboard/project/${projectId}/environment/${environmentId}`}
							>
								<ArrowLeft className="size-4 mr-1" />
								Back to services
							</Link>
						</Button>
					</div>
					<CardContent className="p-6">
						<ProjectMonitoring
							projectId={projectId}
							environmentId={environmentId}
							services={services}
						/>
					</CardContent>
				</div>
			</Card>
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
