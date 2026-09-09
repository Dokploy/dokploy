import {
	Cloud,
	Database,
	FolderUp,
	HardDrive,
	Loader2,
	PlugZap,
	Trash2,
} from "lucide-react";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { HandleDestinations } from "./handle-destinations";

export const ShowDestinations = () => {
	const { data, isPending, refetch } = api.destination.all.useQuery();
	const { mutateAsync: removeDestination, isPending: isRemoving } =
		api.destination.remove.useMutation();
	const { mutateAsync: testConnection } =
		api.destination.testConnection.useMutation();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery(undefined, {
		enabled: !!isCloud,
	});
	const [testingDestinationId, setTestingDestinationId] = useState<
		string | null
	>(null);

	const handleQuickTest = async (
		destination: NonNullable<typeof data>[number],
		serverId?: string,
	) => {
		const targetServerId =
			serverId || (isCloud ? servers?.[0]?.serverId : undefined);

		if (isCloud && !targetServerId) {
			toast.error(
				"A server with SSH keys is required to test destinations in cloud mode. Please add a server first.",
			);
			return;
		}

		setTestingDestinationId(destination.destinationId);
		try {
			const isAzure =
				destination.destinationType === "azure_blob" ||
				destination.destinationType === "az_bs";

			await testConnection({
				destinationType: isAzure ? "azure_blob" : "s3",
				name: destination.name,
				provider:
					(destination.provider as any) || (isAzure ? "account_key" : "AWS"),
				accessKey: destination.accessKey || "",
				secretAccessKey: destination.secretAccessKey,
				bucket: destination.bucket,
				region: destination.region || "",
				endpoint: destination.endpoint || "",
				additionalFlags: destination.additionalFlags || [],
				serverId: targetServerId,
			});
			toast.success(`Connection to "${destination.name}" succeeded!`);
		} catch (error) {
			toast.error(`Connection to "${destination.name}" failed`, {
				description:
					error instanceof Error
						? error.message
						: "Error connecting to storage",
			});
		} finally {
			setTestingDestinationId(null);
		}
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-xs">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2 items-center">
							<HardDrive className="size-6 text-muted-foreground self-center" />
							Backup Destinations
						</CardTitle>
						<CardDescription>
							Configure storage destinations for your backups, including Amazon
							S3 (and S3-compatible providers) and Azure Blob Storage.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading destinations...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center text-center px-4">
										<FolderUp className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											To create backups, set up at least one storage destination
											(S3 or Azure Blob Storage).
										</span>
										{permissions?.destination.create && <HandleDestinations />}
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-3 rounded-lg">
											{data?.map((destination, index) => {
												const isAzure =
													destination.destinationType === "azure_blob" ||
													destination.destinationType === "az_bs";
												const isTesting =
													testingDestinationId === destination.destinationId;

												return (
													<div
														key={destination.destinationId}
														className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
													>
														<div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg bg-background border gap-3 w-full">
															<div className="flex flex-col gap-1.5">
																<div className="flex items-center gap-2 flex-wrap">
																	<span className="text-sm font-medium">
																		{index + 1}. {destination.name}
																	</span>
																	{isAzure ? (
																		<Badge
																			variant="secondary"
																			className="text-xs gap-1 font-normal"
																		>
																			<Cloud className="size-3 text-blue-500" />
																			Azure Blob Storage
																		</Badge>
																	) : (
																		<Badge
																			variant="outline"
																			className="text-xs gap-1 font-normal"
																		>
																			<Database className="size-3 text-amber-500" />
																			S3 • {destination.provider || "Standard"}
																		</Badge>
																	)}
																</div>
																<div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
																	<span>
																		<strong className="font-medium text-foreground">
																			{isAzure ? "Container" : "Bucket"}:
																		</strong>{" "}
																		{destination.bucket}
																	</span>
																	<span>
																		Created at:{" "}
																		{new Date(
																			destination.createdAt,
																		).toLocaleDateString()}
																	</span>
																</div>
															</div>

															<div className="flex flex-row items-center gap-1 self-end sm:self-center">
																{isCloud && servers && servers.length > 1 ? (
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<Button
																				variant="ghost"
																				size="sm"
																				className="h-8 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
																				isLoading={isTesting}
																				title="Test Connection"
																			>
																				<PlugZap className="size-3.5 text-primary" />
																				<span className="hidden md:inline">
																					Test Connection
																				</span>
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end">
																			<DropdownMenuLabel>
																				Run Test on Server
																			</DropdownMenuLabel>
																			{servers.map((server) => (
																				<DropdownMenuItem
																					key={server.serverId}
																					onClick={() =>
																						handleQuickTest(
																							destination,
																							server.serverId,
																						)
																					}
																				>
																					{server.name}
																				</DropdownMenuItem>
																			))}
																		</DropdownMenuContent>
																	</DropdownMenu>
																) : (
																	<Button
																		variant="ghost"
																		size="sm"
																		className="h-8 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
																		isLoading={isTesting}
																		onClick={() =>
																			handleQuickTest(
																				destination,
																				isCloud
																					? servers?.[0]?.serverId
																					: undefined,
																			)
																		}
																		title="Test Connection"
																	>
																		<PlugZap className="size-3.5 text-primary" />
																		<span className="hidden md:inline">
																			Test Connection
																		</span>
																	</Button>
																)}

																<HandleDestinations
																	destinationId={destination.destinationId}
																/>

																{permissions?.destination.delete && (
																	<DialogAction
																		title="Delete Destination"
																		description="Are you sure you want to delete this destination? Any scheduled backups relying on it will fail until updated."
																		type="destructive"
																		onClick={async () => {
																			await removeDestination({
																				destinationId:
																					destination.destinationId,
																			})
																				.then(() => {
																					toast.success(
																						"Destination deleted successfully",
																					);
																					refetch();
																				})
																				.catch(() => {
																					toast.error(
																						"Error deleting destination",
																					);
																				});
																		}}
																	>
																		<Button
																			variant="ghost"
																			size="icon"
																			className="group hover:bg-red-500/10 h-8 w-8"
																			isLoading={isRemoving}
																		>
																			<Trash2 className="size-4 text-primary group-hover:text-red-500" />
																		</Button>
																	</DialogAction>
																)}
															</div>
														</div>
													</div>
												);
											})}
										</div>

										{permissions?.destination.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleDestinations />
											</div>
										)}
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
