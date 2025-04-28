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
import { api } from "@/utils/api";
import { Database, DatabaseBackup, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { ServiceType } from "../../application/advanced/show-resources";
import { AddBackup } from "./add-backup";
import { RestoreBackup } from "./restore-backup";
import { UpdateBackup } from "./update-backup";
import { AlertBlock } from "@/components/shared/alert-block";

interface Props {
	id: string;
	databaseType: Exclude<ServiceType, "application" | "redis"> | "web-server";
	backupType?: "database" | "compose";
}
export const ShowBackups = ({
	id,
	databaseType,
	backupType = "database",
}: Props) => {
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

	console.log(postgres);

	const mutationMap = {
		postgres: () => api.backup.manualBackupPostgres.useMutation(),
		mysql: () => api.backup.manualBackupMySql.useMutation(),
		mariadb: () => api.backup.manualBackupMariadb.useMutation(),
		mongo: () => api.backup.manualBackupMongo.useMutation(),
		"web-server": () => api.backup.manualBackupWebServer.useMutation(),
		compose: () => api.backup.manualBackupCompose.useMutation(),
	};

	const { mutateAsync: manualBackup, isLoading: isManualBackup } = mutationMap[
		databaseType
	]
		? mutationMap[databaseType]()
		: api.backup.manualBackupMongo.useMutation();

	const { mutateAsync: deleteBackup, isLoading: isRemoving } =
		api.backup.remove.useMutation();

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between gap-4  flex-wrap">
				<div className="flex flex-col gap-0.5">
					<CardTitle className="text-xl flex flex-row gap-2">
						<Database className="size-6 text-muted-foreground" />
						Backups
					</CardTitle>
					<CardDescription>
						Add backups to your database to save the data to a different
						provider.
					</CardDescription>
				</div>

				{postgres && postgres?.backups?.length > 0 && (
					<div className="flex flex-col lg:flex-row gap-4 w-full lg:w-auto">
						{databaseType !== "web-server" && (
							<AddBackup
								id={id}
								databaseType={databaseType}
								backupType={backupType}
								refetch={refetch}
							/>
						)}
						<RestoreBackup
							id={id}
							databaseType={databaseType}
							serverId={"serverId" in postgres ? postgres.serverId : undefined}
						/>
					</div>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.length === 0 ? (
					<div className="flex flex-col items-center gap-3">
						<DatabaseBackup className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground text-center">
							To create a backup it is required to set at least 1 provider.
							Please, go to{" "}
							<Link
								href="/dashboard/settings/destinations"
								className="text-foreground"
							>
								S3 Destinations
							</Link>{" "}
							to do so.
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-4 w-full">
						{postgres?.backups.length === 0 ? (
							<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
								<DatabaseBackup className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									No backups configured
								</span>
								<div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
									<AddBackup
										id={id}
										databaseType={databaseType}
										backupType={backupType}
										refetch={refetch}
									/>
									<RestoreBackup
										id={id}
										databaseType={databaseType}
										serverId={
											"serverId" in postgres ? postgres.serverId : undefined
										}
									/>
								</div>
							</div>
						) : (
							<div className="flex flex-col pt-2 gap-4">
								<div className="flex flex-col gap-4 w-full">
									{backupType === "compose" && (
										<AlertBlock type="info">
											Deploy is required to apply changes after creating or
											updating a backup.
										</AlertBlock>
									)}
								</div>
								<div className="flex flex-col gap-6">
									{postgres?.backups.map((backup) => (
										<div key={backup.backupId}>
											<div className="flex w-full flex-col md:flex-row md:items-center justify-between gap-4 md:gap-10 border rounded-lg p-4">
												<div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-8 flex-col gap-8">
													{backup.backupType === "compose" && (
														<>
															<div className="flex flex-col gap-1">
																<span className="font-medium">
																	Service Name
																</span>
																<span className="text-sm text-muted-foreground">
																	{backup.serviceName}
																</span>
															</div>

															<div className="flex flex-col gap-1">
																<span className="font-medium">
																	Database Type
																</span>
																<span className="text-sm text-muted-foreground">
																	{backup.databaseType}
																</span>
															</div>
														</>
													)}
													<div className="flex flex-col gap-1">
														<span className="font-medium">Destination</span>
														<span className="text-sm text-muted-foreground">
															{backup.destination.name}
														</span>
													</div>
													<div className="flex flex-col gap-1">
														<span className="font-medium">Database</span>
														<span className="text-sm text-muted-foreground">
															{backup.database}
														</span>
													</div>
													<div className="flex flex-col gap-1">
														<span className="font-medium">Scheduled</span>
														<span className="text-sm text-muted-foreground">
															{backup.schedule}
														</span>
													</div>
													<div className="flex flex-col gap-1">
														<span className="font-medium">Prefix Storage</span>
														<span className="text-sm text-muted-foreground">
															{backup.prefix}
														</span>
													</div>
													<div className="flex flex-col gap-1">
														<span className="font-medium">Enabled</span>
														<span className="text-sm text-muted-foreground">
															{backup.enabled ? "Yes" : "No"}
														</span>
													</div>
													<div className="flex flex-col gap-1">
														<span className="font-medium">Keep Latest</span>
														<span className="text-sm text-muted-foreground">
															{backup.keepLatestCount || "All"}
														</span>
													</div>
												</div>
												<div className="flex flex-row gap-4">
													<TooltipProvider delayDuration={0}>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	type="button"
																	variant="ghost"
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
																				toast.success(
																					"Manual Backup Successful",
																				);
																			})
																			.catch(() => {
																				toast.error(
																					"Error creating the manual backup",
																				);
																			});
																		setActiveManualBackup(undefined);
																	}}
																>
																	<Play className="size-5  text-muted-foreground" />
																</Button>
															</TooltipTrigger>
															<TooltipContent>Run Manual Backup</TooltipContent>
														</Tooltip>
													</TooltipProvider>

													<UpdateBackup
														backupId={backup.backupId}
														refetch={refetch}
													/>
													<DialogAction
														title="Delete Backup"
														description="Are you sure you want to delete this backup?"
														type="destructive"
														onClick={async () => {
															await deleteBackup({
																backupId: backup.backupId,
															})
																.then(() => {
																	refetch();
																	toast.success("Backup deleted successfully");
																})
																.catch(() => {
																	toast.error("Error deleting backup");
																});
														}}
													>
														<Button
															variant="ghost"
															size="icon"
															className="group hover:bg-red-500/10"
															isLoading={isRemoving}
														>
															<Trash2 className="size-4 text-primary group-hover:text-red-500" />
														</Button>
													</DialogAction>
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
};
