import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Ban, CheckCircle2, Loader2, RefreshCcw, Terminal } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { type LogLine, parseLogs } from "../../docker/logs/utils";
import { TerminalLine } from "../../docker/logs/terminal-line";
interface Props {
	postgresId: string;
}

export const ShowGeneralPostgres = ({ postgresId }: Props) => {
	const { data, refetch } = api.postgres.one.useQuery(
		{
			postgresId: postgresId,
		},
		{ enabled: !!postgresId },
	);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const scrollToBottom = () => {
		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	};

	const handleScroll = () => {
		if (!scrollRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
		setAutoScroll(isAtBottom);
	};
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const { mutateAsync: reload, isLoading: isReloading } =
		api.postgres.reload.useMutation();

	const { mutateAsync: stop, isLoading: isStopping } =
		api.postgres.stop.useMutation();

	const { mutateAsync: start, isLoading: isStarting } =
		api.postgres.start.useMutation();

	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);

	api.postgres.deploy.useSubscription(
		{
			postgresId: postgresId,
		},
		{
			enabled: isDeploying,
			onData(log) {
				if (!isDrawerOpen) {
					setIsDrawerOpen(true);
				}

				if (log === "Deployment completed successfully!") {
					setIsDeploying(false);
				}
				console.log("Received log in component:", log);

				const parsedLogs = parseLogs(log);
				setFilteredLogs((prev) => [...prev, ...parsedLogs]);
			},
			onError(error) {
				console.error("Deployment logs error:", error);
				setIsDeploying(false);
			},
		},
	);

	useEffect(() => {
		scrollToBottom();

		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [filteredLogs, autoScroll]);
	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader className="pb-4">
					<CardTitle>General</CardTitle>
				</CardHeader>
				<CardContent className="flex gap-4">
					<DialogAction
						title="Deploy Postgres"
						description="Are you sure you want to deploy this postgres?"
						type="default"
						onClick={async () => {
							console.log("Deploy button clicked");
							setIsDeploying(true);
						}}
					>
						<Button
							variant="default"
							isLoading={data?.applicationStatus === "running"}
						>
							Deploy
						</Button>
					</DialogAction>

					<DialogAction
						title="Reload Postgres"
						description="Are you sure you want to reload this postgres?"
						type="default"
						onClick={async () => {
							await reload({
								postgresId: postgresId,
								appName: data?.appName || "",
							})
								.then(() => {
									toast.success("Postgres reloaded successfully");
									refetch();
								})
								.catch(() => {
									toast.error("Error reloading Postgres");
								});
						}}
					>
						<Button variant="secondary" isLoading={isReloading}>
							Reload
							<RefreshCcw className="size-4" />
						</Button>
					</DialogAction>
					{data?.applicationStatus === "idle" ? (
						<DialogAction
							title="Start Postgres"
							description="Are you sure you want to start this postgres?"
							type="default"
							onClick={async () => {
								await start({
									postgresId: postgresId,
								})
									.then(() => {
										toast.success("Postgres started successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error starting Postgres");
									});
							}}
						>
							<Button variant="secondary" isLoading={isStarting}>
								Start
								<CheckCircle2 className="size-4" />
							</Button>
						</DialogAction>
					) : (
						<DialogAction
							title="Stop Postgres"
							description="Are you sure you want to stop this postgres?"
							onClick={async () => {
								await stop({
									postgresId: postgresId,
								})
									.then(() => {
										toast.success("Postgres stopped successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error stopping Postgres");
									});
							}}
						>
							<Button variant="destructive" isLoading={isStopping}>
								Stop
								<Ban className="size-4" />
							</Button>
						</DialogAction>
					)}

					<DockerTerminalModal
						appName={data?.appName || ""}
						serverId={data?.serverId || ""}
					>
						<Button variant="outline">
							<Terminal />
							Open Terminal
						</Button>
					</DockerTerminalModal>
				</CardContent>
			</Card>
			<Sheet
				open={!!isDrawerOpen}
				onOpenChange={(open) => {
					setIsDrawerOpen(false);
					setFilteredLogs([]);
					setIsDeploying(false);
				}}
			>
				<SheetContent className="sm:max-w-[740px]  flex flex-col">
					<SheetHeader>
						<SheetTitle>Deployment Logs</SheetTitle>
						<SheetDescription>
							Details of the request log entry.
						</SheetDescription>
					</SheetHeader>
					<div
						ref={scrollRef}
						onScroll={handleScroll}
						className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-[#fafafa] dark:bg-[#050506] rounded custom-logs-scrollbar"
					>
						{" "}
						{filteredLogs.length > 0 ? (
							filteredLogs.map((log: LogLine, index: number) => (
								<TerminalLine key={index} log={log} noTimestamp />
							))
						) : (
							<div className="flex justify-center items-center h-full text-muted-foreground">
								<Loader2 className="h-6 w-6 animate-spin" />
							</div>
						)}
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
};
