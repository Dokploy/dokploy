import { CheckCircle2, Cpu, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";

interface GPUSupportProps {
	serverId?: string;
}

export function GPUSupport({ serverId }: GPUSupportProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const utils = api.useContext();

	const {
		data: gpuStatus,
		isLoading: isChecking,
		refetch,
	} = api.settings.checkGPUStatus.useQuery(
		{ serverId },
		{
			enabled: serverId !== undefined,
		},
	);

	const setupGPU = api.settings.setupGPU.useMutation({
		onMutate: () => {
			setIsLoading(true);
		},
		onSuccess: async () => {
			toast.success("GPU support enabled successfully");
			setIsLoading(false);
			await utils.settings.checkGPUStatus.invalidate({ serverId });
		},
		onError: (error) => {
			toast.error(
				error.message ||
					"Failed to enable GPU support. Please check server logs.",
			);
			setIsLoading(false);
		},
	});

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await utils.settings.checkGPUStatus.invalidate({ serverId });
			await refetch();
		} catch {
			toast.error("Failed to refresh GPU status");
		} finally {
			setIsRefreshing(false);
		}
	};
	useEffect(() => {
		handleRefresh();
	}, []);

	const handleEnableGPU = async () => {
		if (serverId === undefined) {
			toast.error("No server selected");
			return;
		}

		try {
			await setupGPU.mutateAsync({ serverId });
		} catch {
			// Error handling is done in mutation's onError
		}
	};

	return (
		<CardContent className="p-0">
			<div className="flex flex-col gap-4">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
						<div className="flex flex-row gap-2 justify-between w-full items-end max-sm:flex-col">
							<div className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<Cpu className="size-5" />
									<CardTitle className="text-xl">GPU Configuration</CardTitle>
								</div>
								<CardDescription>
									Configure and monitor GPU support
								</CardDescription>
							</div>
							<div className="flex items-center gap-2">
								<DialogAction
									title="Enable GPU Support?"
									description="This will enable GPU support for Docker Swarm on this server. Make sure you have the required hardware and drivers installed."
									onClick={handleEnableGPU}
								>
									<Button
										isLoading={isLoading}
										disabled={isLoading || serverId === undefined || isChecking}
									>
										{isLoading
											? "Enabling GPU..."
											: gpuStatus?.swarmEnabled
												? "Reconfigure GPU"
												: "Enable GPU"}
									</Button>
								</DialogAction>
								<Button
									size="icon"
									onClick={handleRefresh}
									disabled={isChecking || isRefreshing}
								>
									<RefreshCw
										className={`h-5 w-5 ${isChecking || isRefreshing ? "animate-spin" : ""}`}
									/>
								</Button>
							</div>
						</div>
					</CardHeader>

					<CardContent className="flex flex-col gap-4">
						<AlertBlock type="info">
							<div className="font-medium mb-2">System Requirements:</div>
							<ul className="list-disc list-inside text-sm space-y-1">
								<li>NVIDIA GPU hardware must be physically installed</li>
								<li>
									NVIDIA drivers must be installed and running (check with
									nvidia-smi)
								</li>
								<li>
									NVIDIA Container Runtime must be installed
									(nvidia-container-runtime)
								</li>
								<li>User must have sudo/administrative privileges</li>
								<li>System must support CUDA for GPU acceleration</li>
							</ul>
						</AlertBlock>

						{isChecking ? (
							<div className="flex items-center justify-center text-muted-foreground py-4">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>Checking GPU status...</span>
							</div>
						) : (
							<div className="grid gap-4">
								{/* Prerequisites Section */}
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">Prerequisites</h3>
									<p className="text-sm text-muted-foreground mb-4">
										Shows all software checks and available hardware
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label="NVIDIA Driver"
											isEnabled={gpuStatus?.driverInstalled}
											description={
												gpuStatus?.driverVersion
													? `Installed (v${gpuStatus.driverVersion})`
													: "Not Installed"
											}
										/>
										<StatusRow
											label="GPU Model"
											value={gpuStatus?.gpuModel || "Not Detected"}
											showIcon={false}
										/>
										<StatusRow
											label="GPU Memory"
											value={gpuStatus?.memoryInfo || "Not Available"}
											showIcon={false}
										/>
										<StatusRow
											label="Available GPUs"
											value={gpuStatus?.availableGPUs || 0}
											showIcon={false}
										/>
										<StatusRow
											label="CUDA Support"
											isEnabled={gpuStatus?.cudaSupport}
											description={
												gpuStatus?.cudaVersion
													? `Available (v${gpuStatus.cudaVersion})`
													: "Not Available"
											}
										/>
										<StatusRow
											label="NVIDIA Container Runtime"
											isEnabled={gpuStatus?.runtimeInstalled}
											description={
												gpuStatus?.runtimeInstalled
													? "Installed"
													: "Not Installed"
											}
										/>
									</div>
								</div>

								{/* Configuration Status */}
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										Docker Swarm GPU Status
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										Shows the configuration state that changes with the Enable
										GPU
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label="Runtime Configuration"
											isEnabled={gpuStatus?.runtimeConfigured}
											description={
												gpuStatus?.runtimeConfigured
													? "Default Runtime"
													: "Not Default Runtime"
											}
										/>
										<StatusRow
											label="Swarm GPU Support"
											isEnabled={gpuStatus?.swarmEnabled}
											description={
												gpuStatus?.swarmEnabled
													? `Enabled (${gpuStatus.gpuResources} GPU${gpuStatus.gpuResources !== 1 ? "s" : ""})`
													: "Not Enabled"
											}
										/>
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</CardContent>
	);
}

interface StatusRowProps {
	label: string;
	isEnabled?: boolean;
	description?: string;
	value?: string | number;
	showIcon?: boolean;
}

export function StatusRow({
	label,
	isEnabled,
	description,
	value,
	showIcon = true,
}: StatusRowProps) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-sm">{label}</span>
			<div className="flex items-center gap-2">
				{showIcon ? (
					<>
						<span
							className={`text-sm ${isEnabled ? "text-green-500" : "text-red-500"}`}
						>
							{description || (isEnabled ? "Installed" : "Not Installed")}
						</span>
						{isEnabled ? (
							<CheckCircle2 className="size-4 text-green-500" />
						) : (
							<XCircle className="size-4 text-red-500" />
						)}
					</>
				) : (
					<span className="text-sm text-muted-foreground">{value}</span>
				)}
			</div>
		</div>
	);
}
