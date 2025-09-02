import type { findProjectById } from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { FolderInput, Loader2, PlusIcon } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { type ReactElement, useEffect } from "react";
import superjson from "superjson";
import { AdvancedEnvironmentSelector } from "@/components/dashboard/project/advanced-environment-selector";
import { ProjectEnvironment } from "@/components/dashboard/projects/project-environment";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";

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

type Project = Awaited<ReturnType<typeof findProjectById>>;

const Project = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { projectId } = props;
	const { data, isLoading } = api.project.one.useQuery({ projectId });
	const router = useRouter();

	// Redirigir automáticamente al ambiente de producción por defecto
	useEffect(() => {
		if (data?.environments && data.environments.length > 0) {
			const productionEnv = data.environments.find(env => env.name === "production");
			const defaultEnv = productionEnv || data.environments[0];
			
			// Redirigir al ambiente por defecto
			if (defaultEnv) {
				router.push(`/dashboard/project/${projectId}/environment/${defaultEnv.environmentId}`);
			}
		}
	}, [data?.environments, projectId, router]);

	const emptyEnvironments = !data?.environments || data.environments.length === 0;

	return (
		<div>
			<BreadcrumbSidebar
				list={[
					{ name: "Projects", href: "/dashboard/projects" },
					{ name: data?.name || "", href: `/dashboard/project/${projectId}` },
				]}
			/>
			<Head>
				<title>Project: {data?.name} | Dokploy</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl">
					<div className="rounded-xl bg-background shadow-md">
						<div className="flex justify-between gap-4 w-full items-center flex-wrap p-6">
							<CardHeader className="p-0">
								<CardTitle className="text-xl flex flex-row gap-2">
									<FolderInput className="size-6 text-muted-foreground self-center" />
									{data?.name}
								</CardTitle>
								<CardDescription>{data?.description}</CardDescription>
							</CardHeader>
							<div className="flex flex-row gap-4 flex-wrap justify-between items-center">
								<div className="flex flex-row gap-4 flex-wrap">
									<ProjectEnvironment projectId={projectId}>
										<Button variant="outline">Project Environment</Button>
									</ProjectEnvironment>

									{/* Selector Avanzado de Ambientes */}
									{!emptyEnvironments && (
										<AdvancedEnvironmentSelector
											projectId={projectId}
											environments={data?.environments || []}
											currentEnvironmentId={undefined} // En la página principal no hay ambiente actual
										/>
									)}


								</div>
							</div>
						</div>
						<CardContent className="space-y-2 py-8 border-t gap-4 flex flex-col min-h-[60vh]">
							{isLoading ? (
								<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[60vh]">
									<span>Loading...</span>
									<Loader2 className="animate-spin size-4" />
								</div>
							) : emptyEnvironments ? (
								<div className="flex h-[70vh] w-full flex-col items-center justify-center">
									<FolderInput className="size-8 self-center text-muted-foreground" />
									<span className="text-center font-medium text-muted-foreground">
										No environments created yet. Click on Environments to create one.
									</span>
								</div>
							) : (
								<div className="flex h-[70vh] w-full flex-col items-center justify-center">
									<FolderInput className="size-8 self-center text-muted-foreground" />
									<span className="text-center font-medium text-muted-foreground">
										Redirecting to environment...
									</span>
								</div>
							)}
						</CardContent>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default Project;
Project.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ projectId: string }>,
) {
	const { params } = ctx;

	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);
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
			session: session as any,
			user: user as any,
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
		} catch {
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
