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
import { Database, Play, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AddCloudBackup } from "./add-cloud-backup";
import { RestoreCloudBackup } from "./restore-cloud-backup";
import { UpdateCloudBackup } from "./update-cloud-backup";

interface Props {
	databaseId: string;
	databaseType: "postgres" | "mariadb" | "mysql" | "mongo" | "web-server";
}

export const ShowCloudBackups = ({ databaseId, databaseType }: Props) => {
	const [activeManualBackup, setActiveManualBackup] = useState<
		string | undefined
	>();
	const [reconnectingBackupId, setReconnectingBackupId] = useState<
		string | undefined
	>();

	const {
		data: cloudBackups,
		isLoading: isLoadingBackups,
		refetch,
	} = api.cloudStorageBackup.list.useQuery();

	const { mutateAsync: manualBackup, isLoading: isManualBackup } =
		api.cloudStorageBackup.manualBackup.useMutation();

	const { mutateAsync: deleteBackup, isLoading: isRemoving } =
		api.cloudStorageBackup.remove.useMutation();

	const { mutateAsync: reconnectMutation } =
		api.cloudStorageDestination.reconnect.useMutation();

	const filteredBackups = cloudBackups?.filter((backup) => {
		switch (databaseType) {
			case "postgres":
				return backup.postgresId === databaseId;
			case "mysql":
				return backup.mysqlId === databaseId;
			case "mariadb":
				return backup.mariadbId === databaseId;
			case "mongo":
				return backup.mongoId === databaseId;
			case "web-server":
				return backup.databaseType === "web-server";
			default:
				return false;
		}
	});

	const handleReconnect = async (destinationId: string, backupId: string) => {
		try {
			setReconnectingBackupId(backupId);
			const result = await reconnectMutation({ destinationId });
			if (result.silent === false) {
				toast.info(
					"Please complete the authentication in the opened browser window.",
				);
			}
			toast.success("Reconnected successfully! Please try your backup again.");
			await refetch();
		} catch (_err) {
			toast.error("Reconnect failed or was cancelled. Please try again.");
		} finally {
			setReconnectingBackupId(undefined);
		}
	};
	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between gap-4 flex-wrap">
				<div className="flex flex-col gap-0.5">
					<CardTitle className="text-xl flex flex-row gap-2">
						<Database className="size-6 text-muted-foreground" />
						Cloud Backups
					</CardTitle>
					<CardDescription>
						Manage your cloud storage backups and restore data when needed.
					</CardDescription>
				</div>

				{filteredBackups && filteredBackups.length > 0 && (
					<div className="flex flex-col lg:flex-row gap-4 w-full lg:w-auto">
						<AddCloudBackup
							databaseId={databaseId}
							databaseType={databaseType}
							refetch={refetch}
						/>
						<RestoreCloudBackup
							databaseId={databaseId}
							databaseType={databaseType}
						/>
					</div>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoadingBackups ? (
					<div className="flex items-center justify-center py-8">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
					</div>
				) : filteredBackups?.length === 0 ? (
					<div className="flex flex-col items-center gap-3 pt-10">
						<Database className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No cloud backups configured
						</span>
						<div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
							<AddCloudBackup
								databaseId={databaseId}
								databaseType={databaseType}
								refetch={refetch}
							/>
							<RestoreCloudBackup
								databaseId={databaseId}
								databaseType={databaseType}
							/>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-6">
						{filteredBackups?.map((backup) => (
							<div
								key={backup.id}
								className="flex w-full flex-col md:flex-row md:items-center justify-between gap-4 md:gap-10 border rounded-lg p-4"
							>
								<div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 flex-col gap-8">
									<div className="flex flex-col gap-1">
										<span className="font-medium">Destination</span>
										<span className="text-sm text-muted-foreground">
											{backup.cloudStorageDestination?.name || "Unknown"}
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
								</div>
								<div className="flex flex-row gap-4">
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													variant="ghost"
													// isLoading={
													// 	isManualBackup && activeManualBackup === backup.id
													// }
													onClick={async () => {
														setActiveManualBackup(backup.id);
														await manualBackup({
															backupId: backup.id,
														})
															.then(() => {
																toast.success("Manual Backup Successful");
															})
															.catch((err) => {
																if (
																	err?.message
																		?.toLowerCase()
																		.includes("token expired") ||
																	err?.message
																		?.toLowerCase()
																		.includes("invalid_grant")
																) {
																	toast.error(
																		"Error creating the manual backup: token expired, please refresh the token.",
																	);
																} else {
																	toast.error(
																		"Error creating the manual backup",
																	);
																}
															});
														setActiveManualBackup(undefined);
													}}
												>
													{isManualBackup &&
													activeManualBackup === backup.id ? (
														<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
													) : (
														<Play className="size-5 text-muted-foreground" />
													)}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Run Manual Backup</TooltipContent>
										</Tooltip>

										{/* Refresh Token for OAuth providers */}
										{backup.cloudStorageDestination?.provider &&
											["drive", "dropbox", "box"].includes(
												backup.cloudStorageDestination.provider,
											) && (
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															size="icon"
															variant="ghost"
															onClick={() =>
																handleReconnect(
																	backup.cloudStorageDestination.id,
																	backup.id,
																)
															}
														>
															<RefreshCw
																className={`size-4 text-primary group-hover:text-lime-500 ${reconnectingBackupId === backup.id ? "animate-spin" : ""}`}
															/>
														</Button>
													</TooltipTrigger>
													<TooltipContent>Refresh Token</TooltipContent>
												</Tooltip>
											)}

										<UpdateCloudBackup backupId={backup.id} refetch={refetch} />

										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													className="group hover:bg-red-500/10"
													isLoading={isRemoving}
													onClick={async () => {
														await deleteBackup({
															backupId: backup.id,
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
													<Trash2 className="size-4 text-primary group-hover:text-red-500" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Delete Backup</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
};
