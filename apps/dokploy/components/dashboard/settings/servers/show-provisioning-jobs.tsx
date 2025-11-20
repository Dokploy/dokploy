import { format } from "date-fns";
import {
	CheckCircle2,
	Clock,
	Cloud,
	Loader2,
	XCircle,
	AlertCircle,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/utils/api";

const StatusIcon = ({ status }: { status: string }) => {
	switch (status) {
		case "completed":
			return <CheckCircle2 className="size-5 text-green-500" />;
		case "failed":
			return <XCircle className="size-5 text-destructive" />;
		case "pending":
		case "generating_ssh_key":
		case "uploading_ssh_key":
		case "creating_server":
		case "configuring_dokploy":
			return <Loader2 className="size-5 text-blue-500 animate-spin" />;
		default:
			return <Clock className="size-5 text-muted-foreground" />;
	}
};

const StatusBadge = ({ status }: { status: string }) => {
	switch (status) {
		case "completed":
			return <Badge variant="default">Completed</Badge>;
		case "failed":
			return <Badge variant="destructive">Failed</Badge>;
		case "pending":
			return <Badge variant="secondary">Pending</Badge>;
		case "generating_ssh_key":
			return <Badge variant="secondary">Generating SSH Key</Badge>;
		case "uploading_ssh_key":
			return <Badge variant="secondary">Uploading SSH Key</Badge>;
		case "creating_server":
			return <Badge variant="secondary">Creating Server</Badge>;
		case "configuring_dokploy":
			return <Badge variant="secondary">Configuring Dokploy</Badge>;
		case "running_setup":
			return <Badge variant="secondary">Running Setup</Badge>;
		default:
			return <Badge variant="outline">{status}</Badge>;
	}
};

const getProgress = (status: string): number => {
	switch (status) {
		case "pending":
			return 0;
		case "generating_ssh_key":
			return 15;
		case "uploading_ssh_key":
			return 30;
		case "creating_server":
			return 50;
		case "configuring_dokploy":
			return 65;
		case "running_setup":
			return 85;
		case "completed":
			return 100;
		case "failed":
			return 0;
		default:
			return 0;
	}
};

export const ShowProvisioningJobs = () => {
	const utils = api.useUtils();
	const { data: jobs, isLoading } = api.cloudProvider.job.list.useQuery(
		undefined,
		{
			refetchInterval: (data) => {
				// In React Query v4, the callback receives the data directly
				if (!data || data.length === 0) {
					// No data yet - poll aggressively to catch new jobs
					return 2000;
				}

				// Check if there are any active jobs in the last 24 hours
				const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
				const hasActiveJobs = data.some((job) => {
					const jobDate = new Date(job.createdAt);
					const isRecent = jobDate > oneDayAgo;
					const isActive =
						job.status !== "completed" && job.status !== "failed";
					return isRecent && isActive;
				});

				// Poll every 2s if there are active jobs, otherwise every 30s to catch new ones
				return hasActiveJobs ? 2000 : 30000;
			},
			// Start polling immediately
			refetchOnMount: true,
			refetchOnWindowFocus: true,
		},
	);

	const { mutateAsync: clearAllJobs, isLoading: isClearing } =
		api.cloudProvider.job.clearAll.useMutation({
			onSuccess: async () => {
				await utils.cloudProvider.job.list.invalidate();
				toast.success("All provisioning jobs cleared");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to clear jobs");
			},
		});

	// Filter to show only recent jobs (last 24 hours)
	const recentJobs = jobs?.filter((job) => {
		const jobDate = new Date(job.createdAt);
		const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
		return jobDate > oneDayAgo;
	});

	// Check if there are any active jobs (not completed or failed)
	const hasActiveJobs = recentJobs?.some(
		(job) => job.status !== "completed" && job.status !== "failed",
	);

	// Show the component if:
	// 1. We're loading (first load)
	// 2. There are active jobs
	// 3. There are recent jobs (completed/failed in last 24h)
	if (
		!isLoading &&
		!hasActiveJobs &&
		(!recentJobs || recentJobs.length === 0)
	) {
		return null;
	}

	return (
		<Card data-provisioning-jobs>
			<CardHeader>
				<div className="flex items-start justify-between">
					<div className="space-y-1.5">
						<CardTitle className="text-lg flex items-center gap-2">
							<Cloud className="size-5" />
							Recent Provisioning Jobs
						</CardTitle>
						<CardDescription>
							{hasActiveJobs
								? "Monitor your server provisioning progress in real-time"
								: "Showing server provisioning jobs from the last 24 hours"}
						</CardDescription>
					</div>
					{recentJobs && recentJobs.length > 0 && !hasActiveJobs && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => clearAllJobs()}
							disabled={isClearing}
							className="gap-2"
						>
							{isClearing ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Trash2 className="size-4" />
							)}
							Clear All
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading && (!recentJobs || recentJobs.length === 0) ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
						<span className="ml-2 text-sm text-muted-foreground">
							Loading provisioning jobs...
						</span>
					</div>
				) : recentJobs && recentJobs.length > 0 ? (
					recentJobs.map((job) => (
						<Card key={job.jobId} className="overflow-hidden">
							<CardContent className="p-4">
								<div className="space-y-3">
									<div className="flex items-start justify-between">
										<div className="flex items-start gap-3">
											<StatusIcon status={job.status} />
											<div className="flex-1 space-y-1">
												<div className="flex items-center gap-2">
													<span className="font-medium">
														{job.config.name || "Unnamed Server"}
													</span>
													<StatusBadge status={job.status} />
												</div>
												<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
													<span>
														{job.config.location} - {job.config.serverType}
													</span>
													<span>•</span>
													<span>
														Started {format(new Date(job.createdAt), "PPp")}
													</span>
												</div>
											</div>
										</div>
									</div>

									{job.status !== "completed" && job.status !== "failed" && (
										<div className="space-y-1">
											<Progress
												value={getProgress(job.status)}
												className="h-2"
											/>
											<div className="flex items-center justify-between">
												<p className="text-xs text-muted-foreground">
													{getProgress(job.status)}% complete
												</p>
												{job.message && (
													<p className="text-xs text-muted-foreground italic">
														{job.message}
													</p>
												)}
											</div>
										</div>
									)}

									{job.error && (
										<div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3">
											<AlertCircle className="size-4 text-destructive mt-0.5" />
											<div className="flex-1">
												<p className="text-sm font-medium text-destructive">
													Error
												</p>
												<p className="text-sm text-destructive/80">
													{job.error}
												</p>
											</div>
										</div>
									)}

									{job.status === "completed" && job.serverId && (
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<CheckCircle2 className="size-4 text-green-500" />
											<span>
												Server created successfully - ID:{" "}
												{job.serverId.slice(0, 8)}
											</span>
										</div>
									)}
								</div>
							</CardContent>
						</Card>
					))
				) : (
					<div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
						No provisioning jobs found
					</div>
				)}
			</CardContent>
		</Card>
	);
};
