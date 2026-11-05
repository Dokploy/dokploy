import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { formatDistanceToNow } from "date-fns";
import {
	ArrowLeft,
	Ban,
	ExternalLink,
	GitBranch,
	GitCommit,
	RotateCcw,
} from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { toast } from "sonner";
import superjson from "superjson";
import {
	formatDuration,
	formatEvent,
	githubRepositoryUrl,
	isActiveStatus,
	RunStatusIcon,
} from "@/components/dashboard/workflows/utils";
import { WorkflowRunLogs } from "@/components/dashboard/workflows/workflow-run-logs";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const Detail = ({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) => (
	<div className="flex flex-col gap-1">
		<span className="text-xs text-muted-foreground">{label}</span>
		<span className="text-sm flex flex-wrap items-center gap-x-1.5 whitespace-nowrap">
			{children}
		</span>
	</div>
);

const Page = () => {
	const router = useRouter();
	const workflowRunId = router.query.workflowRunId as string;
	const utils = api.useUtils();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: run } = api.workflow.run.useQuery(
		{ workflowRunId },
		{
			enabled: !!workflowRunId,
			refetchInterval: (query) =>
				query.state.data && isActiveStatus(query.state.data.status)
					? 3000
					: false,
		},
	);
	const { mutateAsync: cancel, isPending: isCancelling } =
		api.workflow.cancelRun.useMutation();
	const { mutateAsync: rerun, isPending: isRerunning } =
		api.workflow.rerun.useMutation();

	if (!run) return null;

	const repoUrl = githubRepositoryUrl(
		run.repository.github.githubUrl,
		run.repository.owner,
		run.repository.repository,
	);
	const active = isActiveStatus(run.status);

	return (
		<div className="w-full flex flex-col gap-4">
			<Card className="bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
						<div className="flex flex-col gap-2 min-w-0">
							<Link
								href={`/dashboard/workflows/${run.repository.workflowRepositoryId}`}
								className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
							>
								<ArrowLeft className="size-4" /> {run.repository.owner}/
								{run.repository.repository}
							</Link>
							<h1 className="text-xl font-semibold flex items-center gap-2">
								<RunStatusIcon status={run.status} className="size-5" />
								{run.workflowName} #{run.runNumber}
								{run.attempt > 1 && (
									<span className="text-muted-foreground font-normal text-base">
										(attempt {run.attempt})
									</span>
								)}
								<Badge variant="secondary" className="capitalize">
									{run.status}
								</Badge>
							</h1>
							<span className="text-sm text-muted-foreground truncate">
								{run.title}
							</span>
						</div>
						{permissions?.workflow.run && (
							<div className="flex gap-2">
								{active ? (
									<DialogAction
										title="Cancel run"
										description="Stops the run and its job containers."
										type="destructive"
										onClick={async () => {
											await cancel({ workflowRunId })
												.then(() => {
													toast.success("Cancelling run");
													return utils.workflow.run.invalidate({
														workflowRunId,
													});
												})
												.catch((error) =>
													toast.error("Error cancelling", {
														description: error.message,
													}),
												);
										}}
									>
										<Button variant="outline" isLoading={isCancelling}>
											<Ban className="size-4" /> Cancel
										</Button>
									</DialogAction>
								) : (
									<Button
										variant="outline"
										isLoading={isRerunning}
										onClick={async () => {
											await rerun({ workflowRunId })
												.then((newRun) =>
													router.push(
														`/dashboard/workflows/runs/${newRun.workflowRunId}`,
													),
												)
												.catch((error) =>
													toast.error("Error re-running", {
														description: error.message,
													}),
												);
										}}
									>
										<RotateCcw className="size-4" /> Re-run
									</Button>
								)}
							</div>
						)}
					</CardHeader>
					<CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4 border-t pt-4">
						<Detail label="Trigger">
							{formatEvent(run.event, run.eventAction)}
							{run.pullRequestNumber && (
								<a
									href={`${repoUrl}/pull/${run.pullRequestNumber}`}
									target="_blank"
									rel="noreferrer"
									className="hover:underline"
								>
									#{run.pullRequestNumber}
								</a>
							)}
						</Detail>
						<Detail label="Branch">
							<GitBranch className="size-3.5" />
							{run.branch ?? run.ref}
						</Detail>
						<Detail label="Commit">
							<GitCommit className="size-3.5" />
							<a
								href={`${repoUrl}/commit/${run.sha}`}
								target="_blank"
								rel="noreferrer"
								className="font-mono hover:underline flex items-center gap-1"
							>
								{run.sha.slice(0, 7)} <ExternalLink className="size-3" />
							</a>
						</Detail>
						<Detail label="Duration">
							{formatDuration(run.startedAt, run.finishedAt)}
						</Detail>
						<Detail label="Started">
							{formatDistanceToNow(new Date(run.createdAt), {
								addSuffix: true,
							})}
							{run.actor && (
								<span className="text-muted-foreground">by {run.actor}</span>
							)}
						</Detail>
					</CardContent>
				</div>
			</Card>

			<Card className="bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md p-4 flex flex-col gap-3">
					{run.errorMessage && (
						<AlertBlock type={run.status === "skipped" ? "info" : "error"}>
							{run.errorMessage}
						</AlertBlock>
					)}
					{run.status === "queued" && (
						<AlertBlock type="info">
							Waiting for a free slot on{" "}
							{run.server?.name ?? "the workflow server"}. The server's builds
							concurrency sets how many runs execute at once.
						</AlertBlock>
					)}
					{run.logPath && run.serverId && run.startedAt ? (
						<WorkflowRunLogs
							key={run.workflowRunId}
							logPath={run.logPath}
							serverId={run.serverId}
						/>
					) : (
						run.status !== "queued" &&
						!run.errorMessage && (
							<span className="text-sm text-muted-foreground text-center py-8">
								This run has no logs.
							</span>
						)
					)}
				</div>
			</Card>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Workflow run">{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ workflowRunId: string }>,
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
		await helpers.workflow.run.fetch({
			workflowRunId: ctx.params?.workflowRunId as string,
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
