import {
	ClipboardList,
	DatabaseBackup,
	Loader2,
	Play,
	Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { ShowDeploymentsModal } from "../deployments/show-deployments-modal";
import { HandleVolumeBackups } from "./handle-volume-backups";
import { RestoreVolumeBackups } from "./restore-volume-backups";

interface Props {
	id: string;
	type?: "application" | "compose";
	serverId?: string;
}

export const ShowVolumeBackups = ({
	id,
	type = "application",
	serverId,
}: Props) => {
	const t = useTranslations("applicationVolumeBackups");
	const [runningBackups, setRunningBackups] = useState<Set<string>>(new Set());
	const {
		data: volumeBackups,
		isLoading: isLoadingVolumeBackups,
		refetch: refetchVolumeBackups,
	} = api.volumeBackups.list.useQuery(
		{
			id: id || "",
			volumeBackupType: type,
		},
		{
			enabled: !!id,
		},
	);
	const utils = api.useUtils();
	const { mutateAsync: deleteVolumeBackup, isPending: isDeleting } =
		api.volumeBackups.delete.useMutation();
	const { mutateAsync: runManually } =
		api.volumeBackups.runManually.useMutation();

	const handleRunManually = async (volumeBackupId: string) => {
		setRunningBackups((prev) => new Set(prev).add(volumeBackupId));
		try {
			await runManually({ volumeBackupId });
			toast.success(t("show.toastRunSuccess"));
			await refetchVolumeBackups();
		} catch {
			toast.error(t("show.toastRunError"));
		} finally {
			setRunningBackups((prev) => {
				const newSet = new Set(prev);
				newSet.delete(volumeBackupId);
				return newSet;
			});
		}
	};

	return (
		<Card className="border px-6 shadow-none bg-transparent h-full">
			<CardHeader className="px-0">
				<div className="flex justify-between items-center flex-wrap gap-2">
					<div className="flex flex-col gap-2">
						<CardTitle className="text-xl font-bold flex items-center gap-2">
							{t("show.title")}
						</CardTitle>
						<CardDescription>{t("show.description")}</CardDescription>
					</div>
					<div className="flex items-center gap-2 flex-wrap">
						{volumeBackups && volumeBackups.length > 0 && (
							<>
								<HandleVolumeBackups id={id} volumeBackupType={type} />
								<div className="flex items-center gap-2">
									<RestoreVolumeBackups
										id={id}
										type={type}
										serverId={serverId}
									/>
								</div>
							</>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="px-0">
				{isLoadingVolumeBackups ? (
					<div className="flex gap-4 w-full items-center justify-center text-center mx-auto py-24">
						<Loader2 className="size-4 text-muted-foreground/70 transition-colors animate-spin self-center" />
						<span className="text-sm text-muted-foreground/70">
							{t("show.loading")}
						</span>
					</div>
				) : volumeBackups && volumeBackups.length > 0 ? (
					<div className="grid xl:grid-cols-2 gap-4 grid-cols-1 h-full">
						{volumeBackups.map((volumeBackup) => {
							const serverIdResolved =
								volumeBackup.application?.serverId ||
								volumeBackup.postgres?.serverId ||
								volumeBackup.mysql?.serverId ||
								volumeBackup.mariadb?.serverId ||
								volumeBackup.mongo?.serverId ||
								volumeBackup.redis?.serverId ||
								volumeBackup.compose?.serverId;
							return (
								<div
									key={volumeBackup.volumeBackupId}
									className="flex flex-col sm:flex-row sm:items-center flex-wrap sm:flex-nowrap gap-y-2 justify-between rounded-lg border p-3 transition-colors bg-muted/50 w-full"
								>
									<div className="flex items-start gap-3 w-full sm:w-auto">
										<div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/5">
											<DatabaseBackup className="size-4 text-primary/70" />
										</div>
										<div className="space-y-1.5 w-full sm:w-auto">
											<div className="flex items-center gap-2">
												<h3 className="text-sm font-medium leading-none">
													{volumeBackup.name}
												</h3>
												<Badge
													variant={
														volumeBackup.enabled ? "default" : "secondary"
													}
													className="text-[10px] px-1 py-0"
												>
													{volumeBackup.enabled
														? t("show.enabled")
														: t("show.disabled")}
												</Badge>
											</div>
											<div className="flex items-center gap-2 text-sm text-muted-foreground">
												<Badge
													variant="outline"
													className="font-mono text-[10px] bg-transparent"
												>
													{t("show.cronPrefix")} {volumeBackup.cronExpression}
												</Badge>
											</div>
										</div>
									</div>
									<div className="flex items-center gap-1.5 mt-2 sm:mt-0 sm:ml-3">
										<ShowDeploymentsModal
											id={volumeBackup.volumeBackupId}
											type="volumeBackup"
											serverId={serverIdResolved || undefined}
										>
											<Button variant="ghost" size="icon">
												<ClipboardList className="size-4 transition-colors" />
											</Button>
										</ShowDeploymentsModal>
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														disabled={runningBackups.has(
															volumeBackup.volumeBackupId,
														)}
														onClick={() =>
															handleRunManually(volumeBackup.volumeBackupId)
														}
													>
														{runningBackups.has(volumeBackup.volumeBackupId) ? (
															<Loader2 className="size-4 animate-spin" />
														) : (
															<Play className="size-4 transition-colors" />
														)}
													</Button>
												</TooltipTrigger>
												<TooltipContent>
													{t("show.runManualTooltip")}
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
										<HandleVolumeBackups
											volumeBackupId={volumeBackup.volumeBackupId}
											id={id}
											volumeBackupType={type}
										/>
										<DialogAction
											title={t("show.deleteTitle")}
											description={t("show.deleteDescription")}
											type="destructive"
											onClick={async () => {
												await deleteVolumeBackup({
													volumeBackupId: volumeBackup.volumeBackupId,
												})
													.then(() => {
														utils.volumeBackups.list.invalidate({
															id,
															volumeBackupType: type,
														});
														toast.success(t("show.toastDeleteSuccess"));
													})
													.catch(() => {
														toast.error(t("show.toastDeleteError"));
													});
											}}
										>
											<Button
												variant="ghost"
												size="icon"
												className="group hover:bg-red-500/10"
												isLoading={isDeleting}
											>
												<Trash2 className="size-4 text-primary group-hover:text-red-500" />
											</Button>
										</DialogAction>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex flex-col gap-2 items-center justify-center py-12 rounded-lg">
						<DatabaseBackup className="size-8 mb-4 text-muted-foreground" />
						<p className="text-lg font-medium text-muted-foreground">
							{t("show.emptyTitle")}
						</p>
						<p className="text-sm text-muted-foreground mt-1">
							{t("show.emptyDescription")}
						</p>
						<div className="flex items-center gap-2">
							<HandleVolumeBackups id={id} volumeBackupType={type} />
							<RestoreVolumeBackups id={id} type={type} serverId={serverId} />
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
