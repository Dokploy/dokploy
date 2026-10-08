import type { Restoration } from "@dokploy/server/db/schema";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TerminalLine } from "@/components/dashboard/docker/logs/terminal-line";
import { parseLogs } from "@/components/dashboard/docker/logs/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

export const restorationStatusVariant = {
	running: "yellow",
	done: "green",
	error: "red",
	cancelled: "outline",
} as const;
export const restorationKindLabel = {
	database: "Database",
	volume: "Volume",
	dokploy: "Dokploy",
} as const;

export function RestorationLogDialog({
	open,
	onOpenChange,
	restoration,
	text,
	isLoading,
	isError,
	missing,
	truncated,
	onRetry,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	restoration?: Restoration;
	text: string;
	isLoading: boolean;
	isError: boolean;
	missing: boolean;
	truncated: boolean;
	onRetry: () => void;
}) {
	const scroll = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	useEffect(() => {
		if (open && autoScroll && scroll.current)
			scroll.current.scrollTop = scroll.current.scrollHeight;
	}, [open, text, autoScroll]);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="z-[60] sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Restoration Logs</DialogTitle>
					<DialogDescription>
						{restoration
							? `${restoration.serviceName} · ${restoration.targetName}`
							: "Loading restoration details..."}
					</DialogDescription>
				</DialogHeader>
				{restoration && (
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant={restorationStatusVariant[restoration.status]}>
							{restoration.status}
						</Badge>
						<Badge variant="outline">
							{restorationKindLabel[restoration.kind]}
						</Badge>
						<span className="text-sm text-muted-foreground">
							{new Date(restoration.createdAt).toLocaleString()}
						</span>
					</div>
				)}
				{restoration && (
					<div className="grid gap-1 text-sm">
						<p className="break-all">
							<span className="text-muted-foreground">Backup: </span>
							{restoration.backupFile}
						</p>
						<p>
							<span className="text-muted-foreground">Destination: </span>
							{restoration.destinationName}
						</p>
					</div>
				)}
				{isLoading ? (
					<div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Loading logs...
					</div>
				) : isError ? (
					<div className="flex flex-col items-center gap-3 py-10">
						<p>Failed to load restoration logs.</p>
						<Button variant="outline" onClick={onRetry}>
							Retry
						</Button>
					</div>
				) : missing ? (
					<p className="py-10 text-muted-foreground">
						The log file is unavailable. The recorded result is still shown
						above.
					</p>
				) : (
					<>
						<div
							ref={scroll}
							onScroll={(event) => {
								const element = event.currentTarget;
								setAutoScroll(
									element.scrollHeight -
										element.scrollTop -
										element.clientHeight <
										10,
								);
							}}
							className="h-[50vh] overflow-y-auto space-y-0 border p-4 bg-[#fafafa] dark:bg-[#050506] rounded custom-logs-scrollbar"
						>
							{parseLogs(text).map((log, index) => (
								<TerminalLine
									key={`${log.rawTimestamp ?? ""}-${index}`}
									log={log}
									noTimestamp
								/>
							))}
							{!text && (
								<p className="text-muted-foreground">
									Waiting for restoration output...
								</p>
							)}
						</div>
						{truncated && (
							<p className="text-sm text-muted-foreground">
								Showing the latest log output. Download the full log to view
								earlier lines.
							</p>
						)}
					</>
				)}
				{restoration?.errorMessage && (
					<p className="text-sm text-destructive break-words">
						{restoration.errorMessage}
					</p>
				)}
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-sm text-muted-foreground">
						You can close this window and reopen the logs from Restorations.
					</p>
					{restoration && !missing && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								window.location.href = `/api/restorations/${restoration.restorationId}/logs`;
							}}
						>
							<Download className="size-4 mr-2" />
							Download log
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function RestorationLogs({
	restorationId,
	open,
	onOpenChange,
}: {
	restorationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data, isLoading, isError, refetch } = api.restoration.logs.useQuery(
		{ restorationId },
		{
			enabled: open && !!restorationId,
			refetchInterval: (query) =>
				query.state.data?.restoration.status === "running" ? 2000 : false,
		},
	);
	return (
		<RestorationLogDialog
			open={open}
			onOpenChange={onOpenChange}
			restoration={data?.restoration}
			text={data?.text ?? ""}
			isLoading={isLoading}
			isError={isError}
			missing={data?.missing ?? false}
			truncated={data?.truncated ?? false}
			onRetry={() => {
				void refetch();
			}}
		/>
	);
}
