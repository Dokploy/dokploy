import { formatDistanceToNow } from "date-fns";
import { GithubIcon, Loader2, ServerIcon } from "lucide-react";
import Link from "next/link";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { RunStatusIcon } from "./utils";

export const ShowWorkflowRepositories = () => {
	const { data, isPending } = api.workflow.repositories.useQuery();

	if (isPending) {
		return (
			<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground min-h-[20vh]">
				<Loader2 className="size-4 animate-spin" /> Loading repositories...
			</div>
		);
	}

	if (!data?.length) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground min-h-[20vh] text-center">
				<GithubIcon className="size-8" />
				<span>No repositories imported yet.</span>
				<span>
					Import a GitHub repository to run its workflows on your workflow
					servers.
				</span>
			</div>
		);
	}

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Repository</TableHead>
						<TableHead>Workflows</TableHead>
						<TableHead>Workflow server</TableHead>
						<TableHead>Last run</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((repository) => (
						<TableRow key={repository.workflowRepositoryId}>
							<TableCell>
								<Link
									href={`/dashboard/workflows/${repository.workflowRepositoryId}`}
									className="flex items-center gap-2 font-medium hover:underline"
								>
									<GithubIcon className="size-4" />
									{repository.owner}/{repository.repository}
								</Link>
							</TableCell>
							<TableCell className="text-sm">
								{repository.workflowCount}
							</TableCell>
							<TableCell className="text-sm">
								{repository.server ? (
									<span className="flex items-center gap-2">
										<ServerIcon className="size-4 text-muted-foreground" />
										{repository.server.name}
									</span>
								) : (
									<span className="text-amber-500">Not configured</span>
								)}
							</TableCell>
							<TableCell className="text-sm text-muted-foreground">
								{repository.lastRun ? (
									<span className="flex items-center gap-2">
										<RunStatusIcon status={repository.lastRun.status} />
										{formatDistanceToNow(
											new Date(repository.lastRun.createdAt),
											{
												addSuffix: true,
											},
										)}
									</span>
								) : (
									"—"
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
};
