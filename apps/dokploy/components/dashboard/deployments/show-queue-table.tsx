"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { ListTodo, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type QueueRow =
	inferRouterOutputs<AppRouter>["deployment"]["queueList"][number];

const stateVariants: Record<
	string,
	| "default"
	| "secondary"
	| "destructive"
	| "outline"
	| "yellow"
	| "green"
	| "red"
> = {
	waiting: "secondary",
	active: "yellow",
	delayed: "outline",
	completed: "green",
	failed: "destructive",
	paused: "outline",
};

function formatTs(ts?: number): string {
	if (ts == null) return "—";
	const d = new Date(ts);
	return d.toLocaleString();
}

function getJobLabel(row: QueueRow): string {
	const d = row.data as {
		applicationType?: string;
		applicationId?: string;
		composeId?: string;
		previewDeploymentId?: string;
		titleLog?: string;
		type?: string;
	};
	if (!d) return String(row.id);
	const type = d.applicationType ?? "job";
	const title = d.titleLog ?? "";
	if (title) return title;
	if (d.applicationId) return `Application ${d.applicationId.slice(0, 8)}…`;
	if (d.composeId) return `Compose ${d.composeId.slice(0, 8)}…`;
	if (d.previewDeploymentId)
		return `Preview ${d.previewDeploymentId.slice(0, 8)}…`;
	return `${type} ${String(row.id)}`;
}

export function ShowQueueTable(props: { embedded?: boolean }) {
	const { embedded = false } = props;
	const { data: queueList, isLoading } = api.deployment.queueList.useQuery(
		undefined,
		{ refetchInterval: 3000 },
	);

	return (
		<div className="px-0">
			{isLoading ? (
				<div className="flex gap-4 w-full items-center justify-center min-h-[30vh] text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					<span>Loading queue...</span>
				</div>
			) : (
				<div className="rounded-md border overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Job ID</TableHead>
								<TableHead>Label</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>State</TableHead>
								<TableHead>Added</TableHead>
								<TableHead>Processed</TableHead>
								<TableHead>Finished</TableHead>
								<TableHead>Error</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{queueList?.length ? (
								queueList.map((row) => {
									const d = row.data as Record<string, unknown>;
									const appType = d?.applicationType as string | undefined;
									return (
										<TableRow key={String(row.id)}>
											<TableCell className="font-mono text-xs">
												{String(row.id)}
											</TableCell>
											<TableCell className="max-w-[200px] truncate">
												{getJobLabel(row)}
											</TableCell>
											<TableCell>{appType ?? row.name ?? "—"}</TableCell>
											<TableCell>
												<Badge variant={stateVariants[row.state] ?? "outline"}>
													{row.state}
												</Badge>
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{formatTs(row.timestamp)}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{formatTs(row.processedOn)}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{formatTs(row.finishedOn)}
											</TableCell>
											<TableCell className="max-w-[180px] truncate text-xs text-destructive">
												{row.failedReason ?? "—"}
											</TableCell>
										</TableRow>
									);
								})
							) : (
								<TableRow>
									<TableCell colSpan={9} className="text-center py-12">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground min-h-[30vh]">
											<ListTodo className="size-8" />
											<p className="font-medium">Queue is empty</p>
											<p className="text-sm">
												Deployment jobs will appear here when they are queued.
											</p>
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
