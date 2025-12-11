import {
	ClipboardList,
	Database,
	DatabaseBackup,
	Play,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { toast } from "sonner";
import {
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
} from "@/components/icons/data-tools-icons";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import type { ServiceType } from "../../application/advanced/show-resources";
import { ShowDeploymentsModal } from "../../application/deployments/show-deployments-modal";
import { HandleBackup } from "./handle-backup";
import { RestoreBackup } from "./restore-backup";

interface Props {
	id: string;
	databaseType?: Exclude<ServiceType, "application" | "redis"> | "web-server";
	backupType?: "database" | "compose";
}
export const ShowBackups = ({
	id,
	databaseType,
	backupType = "database",
}: Props) => {
	const { t } = useTranslation("common");
	const [activeManualBackup, setActiveManualBackup] = useState<
		string | undefined
	>();
	const queryMap =
		backupType === "database"
			? {
					postgres: () =>
						api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
					mysql: () =>
						api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
					mariadb: () =>
						api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
					mongo: () =>
						api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
					"web-server": () => api.user.getBackups.useQuery(),
				}
			: {
					compose: () =>
						api.compose.one.useQuery({ composeId: id }, { enabled: !!id }),
				};
	const { data } = api.destination.all.useQuery();
	const key = backupType === "database" ? databaseType : "compose";
	const query = queryMap[key as keyof typeof queryMap];
	const { data: postgres, refetch } = query
		? query()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });

	const mutationMap =
		backupType === "database"
			? {
					postgres: api.backup.manualBackupPostgres.useMutation(),
					mysql: api.backup.manualBackupMySql.useMutation(),
					mariadb: api.backup.manualBackupMariadb.useMutation(),
					mongo: api.backup.manualBackupMongo.useMutation(),
					"web-server": api.backup.manualBackupWebServer.useMutation(),
				}
			: {
					compose: api.backup.manualBackupCompose.useMutation(),
				};

	const mutation = mutationMap[key as keyof typeof mutationMap];

	const { mutateAsync: manualBackup, isLoading: isManualBackup } = mutation
		? mutation
		: api.backup.manualBackupMongo.useMutation();

	const { mutateAsync: deleteBackup, isLoading: isRemoving } =
		api.backup.remove.useMutation();

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between gap-4  flex-wrap">
				<div className="flex flex-col gap-0.5">
					<CardTitle className="text-xl flex flex-row gap-2">
						<Database className="size-6 text-muted-foreground" />
						{t("backups.page.title")}
					</CardTitle>
					<CardDescription>
						{t("backups.page.description")}
					</CardDescription>
				</div>

				{postgres && postgres?.backups?.length > 0 && (
					<div className="flex flex-col lg:flex-row gap-4 w-full lg:w-auto">
						{databaseType !== "web-server" && (
							<HandleBackup
								id={id}
								databaseType={databaseType}
								backupType={backupType}
								refetch={refetch}
							/>
						)}
						<RestoreBackup
							id={id}
							databaseType={databaseType}
							backupType={backupType}
							serverId={"serverId" in postgres ? postgres.serverId : undefined}
						/>
					</div>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.length === 0 ? (
					<div className="flex flex-col items-center gap-3 min-h-[35vh] justify-center">
						<DatabaseBackup className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground text-center">
							{t("backups.empty.noDestination.prefix")} {" "}
							<Link
								href="/dashboard/settings/destinations"
								className="text-foreground"
							>
								{t("settings.nav.destinations")}
							</Link>{" "}
							{t("backups.empty.noDestination.suffix")}
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-4 w-full">
						{postgres?.backups.length === 0 ? (
							<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
								<DatabaseBackup className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									{t("backups.empty.noBackups")}
								</span>
								<div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
									<HandleBackup
										id={id}
										databaseType={databaseType}
										backupType={backupType}
										refetch={refetch}
									/>
									<RestoreBackup
										id={id}
										databaseType={databaseType}
										backupType={backupType}
										serverId={
											"serverId" in postgres ? postgres.serverId : undefined
										}
									/>
								</div>
							</div>
						) : (
							<div className="flex flex-col pt-2 gap-4">
								{backupType === "compose" && (
									<AlertBlock title="Compose Backups">
										{t("backups.composeWarning")}
									</AlertBlock>
								)}
								<div className="flex flex-col gap-6">
									{postgres?.backups.map((backup) => {
										const serverId =
											"serverId" in postgres ? postgres.serverId : undefined;

										return (
											<div key={backup.backupId}>
												<div className="flex w-full flex-col md:flex-row md:items-start justify-between gap-4 border rounded-lg p-4 hover:bg-muted/50 transition-colors">
													<div className="flex flex-col w-full gap-4">
														<div className="flex items-center gap-3">
															{backup.backupType === "compose" && (
																<div className="flex items-center justify-center size-10 rounded-lg">
																	{backup.databaseType === "postgres" && (
																		<PostgresqlIcon className="size-7" />
																	)}
																	{backup.databaseType === "mysql" && (
																		<MysqlIcon className="size-7" />
																	)}
																	{backup.databaseType === "mariadb" && (
																		<MariadbIcon className="size-7" />
																	)}
																	{backup.databaseType === "mongo" && (
																		<MongodbIcon className="size-7" />
																	)}
																</div>
															)}
															<div className="flex flex-col gap-1">
																{backup.backupType === "compose" && (
																	<div className="flex items-center gap-2">
																		<h3 className="font-medium">
																			{backup.serviceName}
																		</h3>
																		<span className="px-1.5 py-0.5 rounded-full bg-muted text-xs font-medium capitalize">
																			{backup.databaseType}
																		</span>
																	</div>
																)}
																<div className="flex items-center gap-2">
																	<div
																		className={cn(
																			"size-1.5 rounded-full",
																			backup.enabled
																				? "bg-green-500"
																				: "bg-red-500",
																		)}
																	/>
																	<span className="text-xs text-muted-foreground">
																		{backup.enabled
																			? t("backups.status.active")
																			: t("backups.status.inactive")}
																	</span>
																</div>
															</div>
														</div>

														<div className="flex flex-wrap gap-x-8 gap-y-2">
															<div className="min-w-[200px]">
																<span className="text-sm font-medium text-muted-foreground">
																	{t("backups.field.destination")}
																</span>
																<p className="font-medium text-sm mt-0.5">
																	{backup.destination.name}
																</p>
															</div>

															<div className="min-w-[150px]">
																<span className="text-sm font-medium text-muted-foreground">
																	{t("backups.field.database")}
																</span>
																<p className="font-medium text-sm mt-0.5">
																	{backup.database}
																</p>
															</div>

															<div className="min-w-[120px]">
																<span className="text-sm font-medium text-muted-foreground">
																	{t("backups.field.schedule")}
																</span>
																<p className="font-medium text-sm mt-0.5">
																	{backup.schedule}
																</p>
															</div>

															<div className="min-w-[150px]">
																<span className="text-sm font-medium text-muted-foreground">
																	{t("backups.field.prefixStorage")}
																</span>
																<p className="font-medium text-sm mt-0.5">
																	{backup.prefix}
																</p>
															</div>

															<div className="min-w-[100px]">
																<span className="text-sm font-medium text-muted-foreground">
																	{t("backups.field.keepLatest")}
																</span>
																<p className="font-medium text-sm mt-0.5">
																	{backup.keepLatestCount || t("backups.field.keepLatestAll")}
																</p>
															</div>
														</div>
													</div>

													<div className="flex flex-row md:flex-col gap-1.5">
														<ShowDeploymentsModal
															id={backup.backupId}
															type="backup"
															serverId={serverId || undefined}
														>
															<Button
																variant="ghost"
																size="icon"
																className="size-8"
															>
																<ClipboardList className="size-4  transition-colors " />
															</Button>
														</ShowDeploymentsModal>
														<TooltipProvider delayDuration={0}>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		type="button"
																		variant="ghost"
																		size="icon"
																		className="size-8"
																		isLoading={
																			isManualBackup &&
																			activeManualBackup === backup.backupId
																		}
																		onClick={async () => {
																			setActiveManualBackup(backup.backupId);
																			await manualBackup({
																				backupId: backup.backupId as string,
																			})
																				.then(async () => {
																					toast.success(t("backups.manual.success"));
																				})
																				.catch(() => {
																					toast.error(t("backups.manual.error"));
																				});
																			setActiveManualBackup(undefined);
																		}}
																	>
																		<Play className="size-4 " />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>
																	{t("backups.run.tooltip")}
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>

														<HandleBackup
															backupType={backup.backupType}
															backupId={backup.backupId}
															databaseType={backup.databaseType}
															refetch={refetch}
														/>
														<DialogAction
															title={t("backups.delete.title")}
															description={t("backups.delete.description")}
															type="destructive"
															onClick={async () => {
																await deleteBackup({
																	backupId: backup.backupId,
																})
																	.then(() => {
																		refetch();
																		toast.success(t("backups.delete.success"));
																	})
																	.catch(() => {
																		toast.error(t("backups.delete.error"));
																	});
															}}
														>
															<Button
																variant="ghost"
																size="icon"
																className="group hover:bg-red-500/10 size-8"
																isLoading={isRemoving}
															>
																<Trash2 className="size-4 text-primary group-hover:text-red-500" />
															</Button>
														</DialogAction>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
};
