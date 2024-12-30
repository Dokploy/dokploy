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
import { DatabaseBackup, Play } from "lucide-react";
import Link from "next/link";
import React from "react";
import { toast } from "sonner";
import { AddBackup } from "../../database/backups/add-backup";
import { DeleteBackup } from "../../database/backups/delete-backup";
import { UpdateBackup } from "../../database/backups/update-backup";
interface Props {
	mariadbId: string;
}

export const ShowBackupMariadb = ({ mariadbId }: Props) => {
	const { data } = api.destination.all.useQuery();
	const { data: mariadb, refetch: refetchMariadb } = api.mariadb.one.useQuery(
		{
			mariadbId,
		},
		{
			enabled: !!mariadbId,
		},
	);

	const { mutateAsync: manualBackup, isLoading: isManualBackup } =
		api.backup.manualBackupMariadb.useMutation();

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between gap-4 flex-wrap">
				<div className="flex flex-col gap-0.5">
					<CardTitle className="text-xl">Backups</CardTitle>
					<CardDescription>
						Add backups to your database to save the data to a different
						providers.
					</CardDescription>
				</div>

				{mariadb && mariadb?.backups?.length > 0 && (
					<AddBackup
						databaseId={mariadbId}
						databaseType="mariadb"
						refetch={refetchMariadb}
					/>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.length === 0 ? (
					<div className="flex flex-col items-center gap-3">
						<DatabaseBackup className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							To create a backup it is required to set at least 1 provider.
							Please, go to{" "}
							<Link
								href="/dashboard/settings/server"
								className="text-foreground"
							>
								Settings
							</Link>{" "}
							to do so.
						</span>
					</div>
				) : (
					<div>
						{mariadb?.backups.length === 0 ? (
							<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
								<DatabaseBackup className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									No backups configured
								</span>
								<AddBackup
									databaseId={mariadbId}
									databaseType="mariadb"
									refetch={refetchMariadb}
								/>
							</div>
						) : (
							<div className="flex flex-col pt-2">
								<div className="flex flex-col gap-6">
									{mariadb?.backups.map((backup) => (
										<div key={backup.backupId}>
											<div className="flex w-full flex-col md:flex-row md:items-center justify-between gap-4 md:gap-10 border rounded-lg p-4">
												<div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 flex-col gap-8">
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
												</div>
												<div className="flex flex-row gap-4">
													<TooltipProvider delayDuration={0}>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	type="button"
																	variant="ghost"
																	isLoading={isManualBackup}
																	onClick={async () => {
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
														refetch={refetchMariadb}
													/>
													<DeleteBackup
														backupId={backup.backupId}
														refetch={refetchMariadb}
													/>
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
