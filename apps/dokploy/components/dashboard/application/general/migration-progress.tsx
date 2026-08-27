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
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Loader2,
	RefreshCcw,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
	applicationId: string;
}

interface MigrationStep {
	step: string;
	status: "pending" | "in_progress" | "completed" | "failed";
	message: string;
	timestamp: string;
}

export const MigrationProgress = ({ applicationId }: Props) => {
	const { data: migrations, refetch } =
		api.serviceMigration.byServiceId.useQuery({
			serviceId: applicationId,
		});

	const { mutateAsync: retry } = api.serviceMigration.retry.useMutation();
	const { mutateAsync: cancel } = api.serviceMigration.cancel.useMutation();

	const [autoRefresh, setAutoRefresh] = useState(true);

	// Auto-refresh when migration is in progress
	useEffect(() => {
		if (!autoRefresh) return;

		const latestMigration = migrations?.[0];
		if (
			latestMigration &&
			latestMigration.status !== "completed" &&
			latestMigration.status !== "failed" &&
			latestMigration.status !== "rolled_back"
		) {
			const interval = setInterval(() => {
				refetch();
			}, 2000); // Refresh every 2 seconds

			return () => clearInterval(interval);
		}
	}, [migrations, refetch, autoRefresh]);

	if (!migrations || migrations.length === 0) {
		return null;
	}

	const latestMigration = migrations[0];
	if (!latestMigration) return null;

	const progress: MigrationStep[] = latestMigration.progress
		? JSON.parse(latestMigration.progress)
		: [];

	const getStatusIcon = (
		status:
			| "pending"
			| "validating"
			| "pausing_source"
			| "backing_up"
			| "transferring"
			| "recreating"
			| "verifying"
			| "completed"
			| "failed"
			| "rolled_back",
	) => {
		switch (status) {
			case "completed":
				return <CheckCircle2 className="h-5 w-5 text-green-500" />;
			case "failed":
			case "rolled_back":
				return <XCircle className="h-5 w-5 text-destructive" />;
			default:
				return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
		}
	};

	const getStatusBadge = (status: typeof latestMigration.status) => {
		const variants: Record<
			typeof status,
			"default" | "secondary" | "destructive" | "outline"
		> = {
			pending: "secondary",
			validating: "default",
			pausing_source: "default",
			backing_up: "default",
			transferring: "default",
			recreating: "default",
			verifying: "default",
			completed: "outline",
			failed: "destructive",
			rolled_back: "destructive",
		};

		return (
			<Badge variant={variants[status]} className="ml-2">
				{status.replace(/_/g, " ")}
			</Badge>
		);
	};

	const calculateProgress = () => {
		if (latestMigration.status === "completed") return 100;
		if (latestMigration.status === "failed") return 0;

		const completedSteps = progress.filter(
			(s) => s.status === "completed",
		).length;
		const totalSteps = Math.max(progress.length, 8); // Assume 8 steps total
		return Math.round((completedSteps / totalSteps) * 100);
	};

	const handleRetry = async () => {
		try {
			await retry({ migrationId: latestMigration.migrationId });
			toast.success("Migration retry started");
			setAutoRefresh(true);
			refetch();
		} catch (error) {
			toast.error("Failed to retry migration");
		}
	};

	const handleCancel = async () => {
		try {
			await cancel({ migrationId: latestMigration.migrationId });
			toast.success("Migration cancelled");
			refetch();
		} catch (error) {
			toast.error("Failed to cancel migration");
		}
	};

	return (
		<Card className="bg-background border-blue-500/20">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center">
						{getStatusIcon(latestMigration.status)}
						<CardTitle className="text-lg ml-2">
							Server Migration
							{getStatusBadge(latestMigration.status)}
						</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						{latestMigration.status === "failed" && (
							<Button size="sm" variant="outline" onClick={handleRetry}>
								<RefreshCcw className="h-4 w-4 mr-1" />
								Retry
							</Button>
						)}
						{latestMigration.status !== "completed" &&
							latestMigration.status !== "failed" &&
							latestMigration.status !== "rolled_back" && (
								<Button size="sm" variant="destructive" onClick={handleCancel}>
									<XCircle className="h-4 w-4 mr-1" />
									Cancel
								</Button>
							)}
					</div>
				</div>
				<CardDescription>
					{latestMigration.sourceServerId ? (
						<>
							Migrating to{" "}
							<span className="font-medium">
								{latestMigration.targetServer?.name}
							</span>
						</>
					) : (
						<>
							Migrating from local to{" "}
							<span className="font-medium">
								{latestMigration.targetServer?.name}
							</span>
						</>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Progress Bar */}
				{latestMigration.status !== "completed" &&
					latestMigration.status !== "failed" && (
						<div className="space-y-2">
							<div className="flex justify-between text-sm">
								<span className="text-muted-foreground">
									Progress: {latestMigration.currentStep?.replace(/_/g, " ")}
								</span>
								<span className="font-medium">{calculateProgress()}%</span>
							</div>
							<Progress value={calculateProgress()} className="h-2" />
						</div>
					)}

				{/* Error Message */}
				{latestMigration.errorMessage && (
					<div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
						<AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
						<div className="flex-1">
							<p className="text-sm font-medium text-destructive">
								Migration Failed
							</p>
							<p className="text-sm text-destructive/80 mt-1">
								{latestMigration.errorMessage}
							</p>
						</div>
					</div>
				)}

				{/* Migration Steps */}
				{progress.length > 0 && (
					<div className="space-y-2">
						<h4 className="text-sm font-medium">Migration Steps</h4>
						<div className="space-y-1.5">
							{progress.map((step, idx) => (
								<div
									key={idx}
									className="flex items-start gap-2 text-sm p-2 rounded-lg hover:bg-muted/50 transition-colors"
								>
									{step.status === "completed" ? (
										<CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
									) : step.status === "failed" ? (
										<XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
									) : step.status === "in_progress" ? (
										<Loader2 className="h-4 w-4 text-blue-500 animate-spin mt-0.5 flex-shrink-0" />
									) : (
										<Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
									)}
									<div className="flex-1 min-w-0">
										<p className="font-medium truncate">{step.step}</p>
										<p className="text-xs text-muted-foreground truncate">
											{step.message}
										</p>
									</div>
									<span className="text-xs text-muted-foreground whitespace-nowrap">
										{new Date(step.timestamp).toLocaleTimeString()}
									</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Completion Message */}
				{latestMigration.status === "completed" && (
					<div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
						<CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
						<div className="flex-1">
							<p className="text-sm font-medium text-green-700 dark:text-green-400">
								Migration Completed Successfully
							</p>
							<p className="text-sm text-muted-foreground mt-1">
								Your application has been migrated. Please redeploy it on the
								new server.
							</p>
						</div>
					</div>
				)}

				{/* Migration Info */}
				<div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
					<span>
						Started: {new Date(latestMigration.startedAt).toLocaleString()}
					</span>
					{latestMigration.completedAt && (
						<span>
							Completed:{" "}
							{new Date(latestMigration.completedAt).toLocaleString()}
						</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
