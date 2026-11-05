import { formatDistanceToNow } from "date-fns";
import { GitBranch, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import {
	formatDuration,
	formatEvent,
	isActiveStatus,
	RUN_STATUSES,
	RunStatusIcon,
	type WorkflowRunStatus,
} from "./utils";

const PAGE_SIZE = 25;

interface Props {
	workflowRepositoryId?: string;
}

export const ShowWorkflowRuns = ({ workflowRepositoryId }: Props) => {
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState<WorkflowRunStatus | "all">("all");
	const [page, setPage] = useState(0);

	const { data, isPending } = api.workflow.runs.useQuery(
		{
			workflowRepositoryId,
			status: status === "all" ? undefined : status,
			search: search || undefined,
			limit: PAGE_SIZE,
			offset: page * PAGE_SIZE,
		},
		{
			refetchInterval: (query) =>
				query.state.data?.items.some((run) => isActiveStatus(run.status))
					? 3000
					: 15000,
		},
	);

	const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col sm:flex-row gap-2">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						placeholder={
							workflowRepositoryId
								? "Search by workflow, title, branch or commit"
								: "Search by repository, workflow, title, branch or commit"
						}
						className="pl-9"
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(0);
						}}
					/>
				</div>
				<Select
					value={status}
					onValueChange={(value) => {
						setStatus(value as WorkflowRunStatus | "all");
						setPage(0);
					}}
				>
					<SelectTrigger className="sm:w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						{RUN_STATUSES.map((value) => (
							<SelectItem key={value} value={value} className="capitalize">
								{value}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{isPending ? (
				<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground min-h-[20vh]">
					<Loader2 className="size-4 animate-spin" /> Loading runs...
				</div>
			) : data?.items.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground min-h-[20vh] text-center">
					<span>No runs yet.</span>
					<span>
						Runs appear here when a push or pull request matches a workflow, or
						when you run one manually.
					</span>
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Run</TableHead>
								{!workflowRepositoryId && <TableHead>Repository</TableHead>}
								<TableHead>Trigger</TableHead>
								<TableHead>Duration</TableHead>
								<TableHead>Started</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data?.items.map((run) => (
								<TableRow key={run.workflowRunId}>
									<TableCell className="max-w-[420px]">
										<Link
											href={`/dashboard/workflows/runs/${run.workflowRunId}`}
											className="flex items-start gap-3 group"
										>
											<RunStatusIcon status={run.status} className="mt-0.5" />
											<div className="flex flex-col min-w-0">
												<span className="font-medium group-hover:underline">
													{run.workflowName} #{run.runNumber}
													{run.attempt > 1 && (
														<span className="text-muted-foreground font-normal">
															{" "}
															(attempt {run.attempt})
														</span>
													)}
												</span>
												<span className="text-sm text-muted-foreground truncate">
													{run.title}
												</span>
											</div>
										</Link>
									</TableCell>
									{!workflowRepositoryId && (
										<TableCell>
											<Link
												href={`/dashboard/workflows/${run.workflowRepositoryId}`}
												className="text-sm hover:underline"
											>
												{run.owner}/{run.repository}
											</Link>
										</TableCell>
									)}
									<TableCell>
										<div className="flex flex-col gap-1">
											<span className="text-sm">
												{formatEvent(run.event, run.eventAction)}
											</span>
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												{run.branch && (
													<span className="flex items-center gap-1 rounded-md border px-1.5 py-0.5">
														<GitBranch className="size-3" />
														{run.branch}
													</span>
												)}
												<span className="font-mono">{run.sha.slice(0, 7)}</span>
											</div>
										</div>
									</TableCell>
									<TableCell className="text-sm">
										{formatDuration(run.startedAt, run.finishedAt)}
									</TableCell>
									<TableCell className="text-sm text-muted-foreground whitespace-nowrap">
										{formatDistanceToNow(new Date(run.createdAt), {
											addSuffix: true,
										})}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{(data?.total ?? 0) > PAGE_SIZE && (
				<div className="flex items-center justify-end gap-2 text-sm">
					<span className="text-muted-foreground">
						Page {page + 1} of {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page === 0}
						onClick={() => setPage((p) => p - 1)}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={page + 1 >= totalPages}
						onClick={() => setPage((p) => p + 1)}
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
};
