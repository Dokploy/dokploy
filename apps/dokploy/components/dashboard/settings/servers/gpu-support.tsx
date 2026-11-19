import { CheckCircle2, Cpu, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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
			toast.success(t("settings.servers.gpuSetup.enabledSuccessfully"));
			setIsLoading(false);
			await utils.settings.checkGPUStatus.invalidate({ serverId });
		},
		onError: (error) => {
			toast.error(error.message || t("settings.servers.gpuSetup.enableError"));
			setIsLoading(false);
		},
	});

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await utils.settings.checkGPUStatus.invalidate({ serverId });
			await refetch();
		} catch {
			toast.error(t("settings.servers.gpuSetup.refreshError"));
		} finally {
			setIsRefreshing(false);
		}
	};
	useEffect(() => {
		handleRefresh();
	}, []);

	const handleEnableGPU = async () => {
		if (serverId === undefined) {
			toast.error(t("settings.servers.gpuSetup.noServerSelected"));
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
										{t("settings.servers.gpuSetup.configurationTitle")}
									</CardTitle>
								</div>
								<CardDescription>
									{t("settings.servers.gpuSetup.configurationDescription")}
								</CardDescription>
							</div>
							<div className="flex items-center gap-2">
								<DialogAction
									title={t("settings.servers.gpuSetup.enableQuestion")}
									description={t("settings.servers.gpuSetup.enableDescription")}
									onClick={handleEnableGPU}
								>
									<Button
										isLoading={isLoading}
										disabled={isLoading || serverId === undefined || isChecking}
									>
										{isLoading
											? t("settings.servers.gpuSetup.loading")
											: gpuStatus?.swarmEnabled
												? t("settings.servers.gpuSetup.reconfigure")
												: t("settings.servers.gpuSetup.enable")}
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
							<div className="font-medium mb-2">
								{t("settings.servers.gpuSetup.systemRequirements")}
							</div>
							<ul className="list-disc list-inside text-sm space-y-1">
								<li>{t("settings.servers.gpuSetup.requirementHardware")}</li>
								<li>{t("settings.servers.gpuSetup.requirementDrivers")}</li>
								<li>{t("settings.servers.gpuSetup.requirementRuntime")}</li>
								<li>{t("settings.servers.gpuSetup.requirementSudo")}</li>
								<li>{t("settings.servers.gpuSetup.requirementCuda")}</li>
							</ul>
						</AlertBlock>

						{isChecking ? (
							<div className="flex items-center justify-center text-muted-foreground py-4">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>{t("settings.servers.gpuSetup.checking")}</span>
							</div>
						) : (
							<div className="grid gap-4">
								{/* Prerequisites Section */}
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.servers.gpuSetup.prerequisites")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.servers.gpuSetup.prerequisitesDescription")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t("settings.servers.gpuSetup.nvidiaDriver")}
											isEnabled={gpuStatus?.driverInstalled}
											description={
												gpuStatus?.driverVersion
													? t(
															"settings.servers.gpuSetup.installedWithVersion",
															{
																version: gpuStatus.driverVersion,
															},
														)
													: t("settings.servers.gpuSetup.notInstalled")
											}
										/>
										<StatusRow
											label={t("settings.servers.gpuSetup.gpuModel")}
											value={
												gpuStatus?.gpuModel ||
												t("settings.servers.gpuSetup.notDetected")
											}
											showIcon={false}
										/>
										<StatusRow
											label={t("settings.servers.gpuSetup.gpuMemory")}
											value={
												gpuStatus?.memoryInfo ||
												t("settings.servers.gpuSetup.notAvailable")
											}
											showIcon={false}
										/>
										<StatusRow
											label={t("settings.servers.gpuSetup.availableGpus")}
											value={gpuStatus?.availableGPUs || 0}
											showIcon={false}
										/>
										<StatusRow
											label={t("settings.servers.gpuSetup.cudaSupport")}
											isEnabled={gpuStatus?.cudaSupport}
											description={
												gpuStatus?.cudaVersion
													? t(
															"settings.servers.gpuSetup.availableWithVersion",
															{
																version: gpuStatus.cudaVersion,
															},
														)
													: t("settings.servers.gpuSetup.notAvailable")
											}
										/>
										<StatusRow
											label={t(
												"settings.servers.gpuSetup.nvidiaContainerRuntime",
											)}
											isEnabled={gpuStatus?.runtimeInstalled}
											description={
												gpuStatus?.runtimeInstalled
													? t("settings.servers.gpuSetup.installed")
													: t("settings.servers.gpuSetup.notInstalled")
											}
										/>
									</div>
								</div>

								{/* Configuration Status */}
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.servers.gpuSetup.swarmStatusTitle")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.servers.gpuSetup.swarmStatusDescription")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t(
												"settings.servers.gpuSetup.runtimeConfiguration",
											)}
											isEnabled={gpuStatus?.runtimeConfigured}
											description={
												gpuStatus?.runtimeConfigured
													? t("settings.servers.gpuSetup.defaultRuntime")
													: t("settings.servers.gpuSetup.notDefaultRuntime")
											}
										/>
										<StatusRow
											label={t("settings.servers.gpuSetup.swarmGpuSupport")}
											isEnabled={gpuStatus?.swarmEnabled}
											description={
												gpuStatus?.swarmEnabled
													? t("settings.servers.gpuSetup.swarmEnabled", {
															amount: gpuStatus.gpuResources,
														})
													: t("settings.servers.gpuSetup.notEnabled")
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
	const { t } = useTranslation();
	return (
		<div className="flex items-center justify-between">
			<span className="text-sm">{label}</span>
			<div className="flex items-center gap-2">
				{showIcon ? (
					<>
						<span
							className={`text-sm ${isEnabled ? "text-green-500" : "text-red-500"}`}
						>
							{description ||
								(isEnabled
									? t("settings.servers.gpuSetup.installed")
									: t("settings.servers.gpuSetup.notInstalled"))}
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
