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
import { CheckCircle2, Cpu, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface GPUSupportProps {
	serverId?: string;
}

export function GPUSupport({ serverId }: GPUSupportProps) {
	const { t } = useTranslation("settings");
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
			toast.success(t("settings.gpuSupport.gpuSupportEnabledSuccessfully"));
			setIsLoading(false);
			await utils.settings.checkGPUStatus.invalidate({ serverId });
		},
		onError: (error) => {
			toast.error(error.message || t("settings.gpuSupport.failedToEnableGpu"));
			setIsLoading(false);
		},
	});

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await utils.settings.checkGPUStatus.invalidate({ serverId });
			await refetch();
		} catch {
			toast.error(t("settings.gpuSupport.failedToRefreshGpuStatus"));
		} finally {
			setIsRefreshing(false);
		}
	};
	useEffect(() => {
		handleRefresh();
	}, []);

	const handleEnableGPU = async () => {
		if (serverId === undefined) {
			toast.error(t("settings.gpuSupport.noServerSelected"));
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
									<CardTitle className="text-xl">
										{t("settings.gpuSupport.gpuConfiguration")}
									</CardTitle>
								</div>
								<CardDescription>
									{t("settings.gpuSupport.configureAndMonitor")}
								</CardDescription>
							</div>
							<div className="flex items-center gap-2">
								<DialogAction
									title={t("settings.gpuSupport.enableGpuSupport")}
									description={t("settings.gpuSupport.enableGpuDescription")}
									onClick={handleEnableGPU}
								>
									<Button
										isLoading={isLoading}
										disabled={isLoading || serverId === undefined || isChecking}
									>
										{isLoading
											? t("settings.gpuSupport.enablingGpu")
											: gpuStatus?.swarmEnabled
												? t("settings.gpuSupport.reconfigureGpu")
												: t("settings.gpuSupport.enableGpu")}
									</Button>
								</DialogAction>
								<Button
									size="icon"
									onClick={handleRefresh}
									disabled={isChecking || isRefreshing}
								>
									<RefreshCw
										className={`h-5 w-5 ${
											isChecking || isRefreshing ? "animate-spin" : ""
										}`}
									/>
								</Button>
							</div>
						</div>
					</CardHeader>

					<CardContent className="flex flex-col gap-4">
						<AlertBlock type="info">
							<div className="font-medium mb-2">
								{t("settings.gpuSupport.systemRequirements")}
							</div>
							<ul className="list-disc list-inside text-sm space-y-1">
								<li>{t("settings.gpuSupport.nvidiaGpuHardware")}</li>
								<li>{t("settings.gpuSupport.nvidiaDrivers")}</li>
								<li>{t("settings.gpuSupport.nvidiaContainerRuntime")}</li>
								<li>{t("settings.gpuSupport.sudoPrivileges")}</li>
								<li>{t("settings.gpuSupport.cudaSupport")}</li>
							</ul>
						</AlertBlock>

						{isChecking ? (
							<div className="flex items-center justify-center text-muted-foreground py-4">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>{t("settings.gpuSupport.checkingGpuStatus")}</span>
							</div>
						) : (
							<div className="grid gap-4">
								{/* Prerequisites Section */}
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.gpuSupport.prerequisites")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.gpuSupport.prerequisitesDescription")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t("settings.gpuSupport.nvidiaDriver")}
											isEnabled={gpuStatus?.driverInstalled}
											description={
												gpuStatus?.driverVersion
													? t("settings.gpuSupport.installedVersion", {
															version: gpuStatus.driverVersion,
														})
													: t("settings.gpuSupport.notInstalled")
											}
										/>
										<StatusRow
											label={t("settings.gpuSupport.gpuModel")}
											value={
												gpuStatus?.gpuModel ||
												t("settings.gpuSupport.notDetected")
											}
											showIcon={false}
										/>
										<StatusRow
											label={t("settings.gpuSupport.gpuMemory")}
											value={
												gpuStatus?.memoryInfo ||
												t("settings.gpuSupport.notAvailable")
											}
											showIcon={false}
										/>
										<StatusRow
											label={t("settings.gpuSupport.availableGpus")}
											value={gpuStatus?.availableGPUs || 0}
											showIcon={false}
										/>
										<StatusRow
											label={t("settings.gpuSupport.cudaSupport")}
											isEnabled={gpuStatus?.cudaSupport}
											description={
												gpuStatus?.cudaVersion
													? t("settings.gpuSupport.availableVersion", {
															version: gpuStatus.cudaVersion,
														})
													: t("settings.gpuSupport.notAvailable")
											}
										/>
										<StatusRow
											label={t("settings.gpuSupport.nvidiaContainerRuntime")}
											isEnabled={gpuStatus?.runtimeInstalled}
											description={
												gpuStatus?.runtimeInstalled
													? t("settings.gpuSupport.installed")
													: t("settings.gpuSupport.notInstalled")
											}
										/>
									</div>
								</div>

								{/* Configuration Status */}
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.gpuSupport.dockerSwarmGpuStatus")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.gpuSupport.dockerSwarmGpuDescription")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t("settings.gpuSupport.runtimeConfiguration")}
											isEnabled={gpuStatus?.runtimeConfigured}
											description={
												gpuStatus?.runtimeConfigured
													? t("settings.gpuSupport.defaultRuntime")
													: t("settings.gpuSupport.notDefaultRuntime")
											}
										/>
										<StatusRow
											label={t("settings.gpuSupport.swarmGpuSupport")}
											isEnabled={gpuStatus?.swarmEnabled}
											description={
												gpuStatus?.swarmEnabled
													? t("settings.gpuSupport.enabledGpus", {
															count: gpuStatus.gpuResources,
														})
													: t("settings.gpuSupport.notEnabled")
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
							className={`text-sm ${
								isEnabled ? "text-green-500" : "text-red-500"
							}`}
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
