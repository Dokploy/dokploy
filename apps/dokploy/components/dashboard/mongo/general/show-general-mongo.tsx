import { DialogAction } from "@/components/shared/dialog-action";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { api } from "@/utils/api";
import {
	Ban,
	CheckCircle2,
	HelpCircle,
	RefreshCcw,
	Terminal,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type LogLine, parseLogs } from "../../docker/logs/utils";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
interface Props {
	mongoId: string;
}

export const ShowGeneralMongo = ({ mongoId }: Props) => {
	const { data, refetch } = api.mongo.one.useQuery(
		{
			mongoId,
		},
		{ enabled: !!mongoId },
	);

	const { mutateAsync: reload, isLoading: isReloading } =
		api.mongo.reload.useMutation();

	const { mutateAsync: start, isLoading: isStarting } =
		api.mongo.start.useMutation();

	const { mutateAsync: stop, isLoading: isStopping } =
		api.mongo.stop.useMutation();

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	api.mongo.deployWithLogs.useSubscription(
		{
			mongoId: mongoId,
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

				const parsedLogs = parseLogs(log);
				setFilteredLogs((prev) => [...prev, ...parsedLogs]);
			},
			onError(error) {
				console.error("Deployment logs error:", error);
				setIsDeploying(false);
			},
		},
	);
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						<TooltipProvider delayDuration={0}>
							<DialogAction
								title="Deploy Mongo"
								description="Are you sure you want to deploy this mongo?"
								type="default"
								onClick={async () => {
									setIsDeploying(true);
									await new Promise((resolve) => setTimeout(resolve, 1000));
									refetch();
								}}
							>
								<Button
									variant="default"
									isLoading={data?.applicationStatus === "running"}
									className="flex items-center gap-1.5"
								>
									Deploy
									<Tooltip>
										<TooltipTrigger asChild>
											<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>Downloads and sets up the MongoDB database</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
							<DialogAction
								title="Reload Mongo"
								description="Are you sure you want to reload this mongo?"
								type="default"
								onClick={async () => {
									await reload({
										mongoId: mongoId,
										appName: data?.appName || "",
									})
										.then(() => {
											toast.success("Mongo reloaded successfully");
											refetch();
										})
										.catch(() => {
											toast.error("Error reloading Mongo");
										});
								}}
							>
								<Button
									variant="secondary"
									isLoading={isReloading}
									className="flex items-center gap-1.5"
								>
									Reload
									<RefreshCcw className="size-4" />
									<Tooltip>
										<TooltipTrigger asChild>
											<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>Restart the MongoDB service without rebuilding</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
							{data?.applicationStatus === "idle" ? (
								<DialogAction
									title="Start Mongo"
									description="Are you sure you want to start this mongo?"
									type="default"
									onClick={async () => {
										await start({
											mongoId: mongoId,
										})
											.then(() => {
												toast.success("Mongo started successfully");
												refetch();
											})
											.catch(() => {
												toast.error("Error starting Mongo");
											});
									}}
								>
									<Button
										variant="secondary"
										isLoading={isStarting}
										className="flex items-center gap-1.5"
									>
										Start
										<CheckCircle2 className="size-4" />
										<Tooltip>
											<TooltipTrigger asChild>
												<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
											</TooltipTrigger>
											<TooltipPrimitive.Portal>
												<TooltipContent sideOffset={5} className="z-[60]">
													<p>
														Start the MongoDB database (requires a previous
														successful setup)
													</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							) : (
								<DialogAction
									title="Stop Mongo"
									description="Are you sure you want to stop this mongo?"
									onClick={async () => {
										await stop({
											mongoId: mongoId,
										})
											.then(() => {
												toast.success("Mongo stopped successfully");
												refetch();
											})
											.catch(() => {
												toast.error("Error stopping Mongo");
											});
									}}
								>
									<Button
										variant="destructive"
										isLoading={isStopping}
										className="flex items-center gap-1.5"
									>
										Stop
										<Ban className="size-4" />
										<Tooltip>
											<TooltipTrigger asChild>
												<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
											</TooltipTrigger>
											<TooltipPrimitive.Portal>
												<TooltipContent sideOffset={5} className="z-[60]">
													<p>Stop the currently running MongoDB database</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							)}
						</TooltipProvider>
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
				<DrawerLogs
					isOpen={isDrawerOpen}
					onClose={() => {
						setIsDrawerOpen(false);
						setFilteredLogs([]);
						setIsDeploying(false);
						refetch();
					}}
					filteredLogs={filteredLogs}
				/>
			</div>
		</>
	);
};
