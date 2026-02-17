import { Database, FolderUp, HardDrive, Loader2, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { HandleDestinations } from "./handle-destinations";

const getDestinationTypeLabel = (type: string | null) => {
	switch (type) {
		case "sftp":
			return "SFTP";
		case "rclone":
			return "Rclone";
		case "s3":
		default:
			return "S3";
	}
};

const getDestinationIcon = (type: string | null) => {
	switch (type) {
		case "sftp":
			return <Server className="size-3.5 text-muted-foreground" />;
		case "rclone":
			return <HardDrive className="size-3.5 text-muted-foreground" />;
		case "s3":
		default:
			return <Database className="size-3.5 text-muted-foreground" />;
	}
};

export const ShowDestinations = () => {
	const { data, isLoading, refetch } = api.destination.all.useQuery();
	const { mutateAsync, isLoading: isRemoving } =
		api.destination.remove.useMutation();
	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Database className="size-6 text-muted-foreground self-center" />
							Backup Destinations
						</CardTitle>
						<CardDescription>
							Add your providers like AWS S3, Cloudflare R2, SFTP servers,
							Google Drive, OneDrive, and more via rclone.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<FolderUp className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											To create a backup it is required to set at least 1
											provider.
										</span>
										<HandleDestinations />
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg ">
											{data?.map((destination, index) => (
												<div
													key={destination.destinationId}
													className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border  w-full">
														<div className="flex flex-col gap-1">
															<div className="flex items-center gap-2">
																{getDestinationIcon(
																	destination.destinationType,
																)}
																<span className="text-sm">
																	{index + 1}. {destination.name}
																</span>
																<span className="text-xs px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
																	{getDestinationTypeLabel(
																		destination.destinationType,
																	)}
																</span>
															</div>
															<span className="text-xs text-muted-foreground">
																Created at:{" "}
																{new Date(
																	destination.createdAt,
																).toLocaleDateString()}
															</span>
														</div>
														<div className="flex flex-row gap-1">
															<HandleDestinations
																destinationId={destination.destinationId}
															/>
															<DialogAction
																title="Delete Destination"
																description="Are you sure you want to delete this destination?"
																type="destructive"
																onClick={async () => {
																	await mutateAsync({
																		destinationId: destination.destinationId,
																	})
																		.then(() => {
																			toast.success(
																				"Destination deleted successfully",
																			);
																			refetch();
																		})
																		.catch(() => {
																			toast.error("Error deleting destination");
																		});
																}}
															>
																<Button
																	variant="ghost"
																	size="icon"
																	className="group hover:bg-red-500/10 "
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

										<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
											<HandleDestinations />
										</div>
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
