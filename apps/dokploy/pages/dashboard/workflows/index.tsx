import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { GitBranch, History, Workflow } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ImportWorkflowRepository } from "@/components/dashboard/workflows/import-workflow-repository";
import { ShowWorkflowRepositories } from "@/components/dashboard/workflows/show-workflow-repositories";
import { ShowWorkflowRuns } from "@/components/dashboard/workflows/show-workflow-runs";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const Page = () => {
	const router = useRouter();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const tab = router.query.tab === "repositories" ? "repositories" : "runs";

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
						<div className="flex flex-col gap-1.5">
							<CardTitle className="text-xl flex flex-row gap-2">
								<Workflow className="size-6 text-muted-foreground self-center" />
								Workflows
							</CardTitle>
							<CardDescription>
								Run the GitHub Actions workflows of your repositories on your
								own workflow servers.
							</CardDescription>
						</div>
						{permissions?.workflow.create && <ImportWorkflowRepository />}
					</CardHeader>
					<CardContent className="border-t py-6">
						<Tabs
							value={tab}
							onValueChange={(value) =>
								router.replace(
									{ query: value === "runs" ? {} : { tab: value } },
									undefined,
									{ shallow: true },
								)
							}
						>
							<TabsList>
								<TabsTrigger value="runs" className="gap-2">
									<History className="size-4" /> Recent Runs
								</TabsTrigger>
								<TabsTrigger value="repositories" className="gap-2">
									<GitBranch className="size-4" /> Repositories
								</TabsTrigger>
							</TabsList>
							<TabsContent value="runs" className="pt-4">
								<ShowWorkflowRuns />
							</TabsContent>
							<TabsContent value="repositories" className="pt-4">
								<ShowWorkflowRepositories />
							</TabsContent>
						</Tabs>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Workflows">{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);
	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
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
	await helpers.user.get.prefetch();
	await helpers.user.getPermissions.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
