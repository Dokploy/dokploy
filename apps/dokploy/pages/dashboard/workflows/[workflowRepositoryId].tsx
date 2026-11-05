import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { formatDistanceToNow } from "date-fns";
import {
	AlertTriangle,
	ArrowLeft,
	ExternalLink,
	FileCode,
	GithubIcon,
	History,
	RefreshCw,
} from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { toast } from "sonner";
import superjson from "superjson";
import { ShowWorkflowDefinitions } from "@/components/dashboard/workflows/show-workflow-definitions";
import { ShowWorkflowRuns } from "@/components/dashboard/workflows/show-workflow-runs";
import { githubRepositoryUrl } from "@/components/dashboard/workflows/utils";
import { WorkflowRepositorySettings } from "@/components/dashboard/workflows/workflow-repository-settings";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const Page = () => {
	const router = useRouter();
	const workflowRepositoryId = router.query.workflowRepositoryId as string;
	const utils = api.useUtils();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: repository } = api.workflow.repository.useQuery(
		{ workflowRepositoryId },
		{ enabled: !!workflowRepositoryId },
	);
	const { mutateAsync: sync, isPending: isSyncing } =
		api.workflow.sync.useMutation();

	if (!repository) return null;

	return (
		<div className="w-full flex flex-col gap-4">
			<Card className="bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
						<div className="flex flex-col gap-2">
							<Link
								href="/dashboard/workflows?tab=repositories"
								className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
							>
								<ArrowLeft className="size-4" /> Workflows
							</Link>
							<h1 className="text-xl font-semibold flex items-center gap-2">
								<GithubIcon className="size-5" />
								{repository.owner}/{repository.repository}
							</h1>
							<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
								<span>Default branch: {repository.defaultBranch}</span>
								{repository.lastSyncedAt && (
									<span>
										Synced{" "}
										{formatDistanceToNow(new Date(repository.lastSyncedAt), {
											addSuffix: true,
										})}
									</span>
								)}
								<span>
									Server: {repository.server?.name ?? "not configured"}
								</span>
								<a
									href={githubRepositoryUrl(
										repository.githubUrl,
										repository.owner,
										repository.repository,
									)}
									target="_blank"
									rel="noreferrer"
									className="flex items-center gap-1 hover:text-foreground"
								>
									View on GitHub <ExternalLink className="size-3" />
								</a>
							</div>
						</div>
						<div className="flex gap-2">
							{permissions?.workflow.update && (
								<>
									<Button
										variant="outline"
										isLoading={isSyncing}
										onClick={async () => {
											await sync({ workflowRepositoryId })
												.then(async () => {
													toast.success("Workflows synced");
													await Promise.all([
														utils.workflow.repository.invalidate(),
														utils.workflow.workflows.invalidate(),
													]);
												})
												.catch((error) =>
													toast.error("Error syncing", {
														description: error.message,
													}),
												);
										}}
									>
										<RefreshCw className="size-4" /> Sync
									</Button>
									<WorkflowRepositorySettings repository={repository} />
								</>
							)}
						</div>
					</CardHeader>
					{(repository.syncError || !repository.serverId) && (
						<CardContent className="flex flex-col gap-2">
							{!repository.serverId && (
								<AlertBlock type="warning">
									This repository has no workflow server, so its runs fail right
									away. Pick one in Settings.
								</AlertBlock>
							)}
							{repository.syncError && (
								<AlertBlock type="error">
									<span className="flex items-center gap-2">
										<AlertTriangle className="size-4" />
										{repository.syncError}
									</span>
								</AlertBlock>
							)}
						</CardContent>
					)}
				</div>
			</Card>

			<Card className="bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md p-6">
					<Tabs defaultValue="runs">
						<TabsList>
							<TabsTrigger value="runs" className="gap-2">
								<History className="size-4" /> Runs
							</TabsTrigger>
							<TabsTrigger value="workflows" className="gap-2">
								<FileCode className="size-4" /> Workflows
							</TabsTrigger>
						</TabsList>
						<TabsContent value="runs" className="pt-4">
							<ShowWorkflowRuns workflowRepositoryId={workflowRepositoryId} />
						</TabsContent>
						<TabsContent value="workflows" className="pt-4">
							<ShowWorkflowDefinitions repository={repository} />
						</TabsContent>
					</Tabs>
				</div>
			</Card>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Workflows">{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ workflowRepositoryId: string }>,
) {
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

	try {
		await helpers.workflow.repository.fetch({
			workflowRepositoryId: ctx.params?.workflowRepositoryId as string,
		});
	} catch {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/workflows",
			},
		};
	}

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
