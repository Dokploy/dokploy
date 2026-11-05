import type { inferRouterOutputs } from "@trpc/server";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { RunWorkflowDialog } from "./run-workflow-dialog";
import { formatTrigger } from "./utils";

type Repository = inferRouterOutputs<AppRouter>["workflow"]["repository"];

interface Props {
	repository: Repository;
}

export const ShowWorkflowDefinitions = ({ repository }: Props) => {
	const utils = api.useUtils();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: workflows, isPending } = api.workflow.workflows.useQuery({
		workflowRepositoryId: repository.workflowRepositoryId,
	});
	const { mutateAsync: toggle } = api.workflow.toggleWorkflow.useMutation();

	const directories = [
		...(repository.runDokployWorkflows ? [".dokploy/workflows"] : []),
		...(repository.runGithubWorkflows ? [".github/workflows"] : []),
	];

	if (isPending) {
		return (
			<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground min-h-[15vh]">
				<Loader2 className="size-4 animate-spin" /> Loading workflows...
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-muted-foreground">
				Read from the {repository.defaultBranch} branch. Runs always use the
				workflow files at the commit that triggered them.
			</p>
			{workflows?.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground min-h-[15vh] text-center">
					{directories.length === 0 ? (
						<span>
							Running workflows is turned off for both directories in the
							repository settings.
						</span>
					) : (
						<span>
							No workflow files found in {directories.join(" or ")} on{" "}
							{repository.defaultBranch}.
						</span>
					)}
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Workflow</TableHead>
								<TableHead>Triggers</TableHead>
								<TableHead>Jobs</TableHead>
								<TableHead>Enabled</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{workflows?.map((workflow) => (
								<TableRow key={workflow.workflowId}>
									<TableCell>
										<div className="flex flex-col gap-0.5">
											<span className="font-medium flex items-center gap-2">
												{workflow.name}
												{workflow.parseError && (
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger>
																<AlertTriangle className="size-4 text-amber-500" />
															</TooltipTrigger>
															<TooltipContent className="max-w-sm">
																{workflow.parseError}
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
												)}
											</span>
											<code className="text-xs text-muted-foreground">
												{workflow.path}
											</code>
										</div>
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{workflow.triggers.map((trigger) => (
												<Badge key={trigger.event} variant="secondary">
													{formatTrigger(trigger)}
												</Badge>
											))}
										</div>
									</TableCell>
									<TableCell className="text-sm">
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger className="text-sm">
													{workflow.jobs.length}{" "}
													{workflow.jobs.length === 1 ? "job" : "jobs"}
												</TooltipTrigger>
												<TooltipContent>
													<div className="flex flex-col gap-1">
														{workflow.jobs.map((job) => (
															<span key={job.id}>
																{job.name}{" "}
																<span className="text-muted-foreground">
																	({job.runsOn.join(", ") || "no runs-on"})
																</span>
															</span>
														))}
													</div>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</TableCell>
									<TableCell>
										<Switch
											checked={workflow.enabled}
											disabled={!permissions?.workflow.update}
											onCheckedChange={async (enabled) => {
												await toggle({
													workflowId: workflow.workflowId,
													enabled,
												})
													.then(() =>
														utils.workflow.workflows.invalidate({
															workflowRepositoryId:
																repository.workflowRepositoryId,
														}),
													)
													.catch((error) =>
														toast.error("Error updating the workflow", {
															description: error.message,
														}),
													);
											}}
										/>
									</TableCell>
									<TableCell className="text-right">
										{permissions?.workflow.run &&
											workflow.triggers.some(
												(trigger) => trigger.event === "workflow_dispatch",
											) && (
												<RunWorkflowDialog
													workflow={workflow}
													githubId={repository.githubId}
													owner={repository.owner}
													repository={repository.repository}
													defaultBranch={repository.defaultBranch}
													disabled={!workflow.enabled || !repository.serverId}
												/>
											)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
};
