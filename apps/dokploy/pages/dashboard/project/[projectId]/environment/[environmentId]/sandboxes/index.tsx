import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { ArrowLeft, Box } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import Link from "next/link";
import type { ReactElement } from "react";
import superjson from "superjson";
import { AddSandbox } from "@/components/dashboard/sandbox/add-sandbox";
import { ShowSandboxes } from "@/components/dashboard/sandbox/show-sandboxes";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AdvanceBreadcrumb } from "@/components/shared/advance-breadcrumb";
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

const SandboxesPage = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { projectId, environmentId } = props;
	const { data: environment } = api.environment.one.useQuery({ environmentId });
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { config: whitelabeling } = useWhitelabeling();
	const appName = whitelabeling?.appName || "Dokploy";

	return (
		<div className="pb-10">
			<AdvanceBreadcrumb />
			<Head>
				<title>
					Sandboxes: {environment?.name} | {environment?.project?.name} |{" "}
					{appName}
				</title>
			</Head>
			<Card className="bg-sidebar p-2.5 rounded-xl w-full">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row flex-wrap justify-between items-center gap-4">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-xl flex items-center gap-2">
								<Box className="size-6 text-muted-foreground" />
								Sandboxes
							</CardTitle>
							<CardDescription>
								Ephemeral containers for agents and automations in{" "}
								{environment?.project?.name} / {environment?.name}.
							</CardDescription>
						</div>
						<div className="flex gap-2">
							<Link
								href={`/dashboard/project/${projectId}/environment/${environmentId}`}
							>
								<Button variant="outline">
									<ArrowLeft className="size-4" />
									Services
								</Button>
							</Link>
							{permissions?.service.create && (
								<AddSandbox
									projectId={projectId}
									environmentId={environmentId}
								/>
							)}
						</div>
					</CardHeader>
					<CardContent className="py-8 border-t">
						<ShowSandboxes
							projectId={projectId}
							environmentId={environmentId}
						/>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

export default SandboxesPage;
SandboxesPage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ projectId: string; environmentId: string }>,
) {
	const { params, req, res } = ctx;
	const { user, session } = await validateRequest(req);
	if (!user) {
		return { redirect: { permanent: false, destination: "/" } };
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
			await helpers.environment.one.fetch({
				environmentId: params.environmentId,
			});
			await helpers.sandbox.list.prefetch({
				environmentId: params.environmentId,
			});
			return {
				props: {
					trpcState: helpers.dehydrate(),
					projectId: params.projectId,
					environmentId: params.environmentId,
				},
			};
		} catch {
			return { redirect: { permanent: false, destination: "/" } };
		}
	}
	return { redirect: { permanent: false, destination: "/" } };
}
