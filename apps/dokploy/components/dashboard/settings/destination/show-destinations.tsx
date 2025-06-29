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
import { Database, FolderUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isCloudStorageProvider } from "./cloud-storage-destinations";
import { HandleDestinations } from "./handle-destinations";

export const ShowDestinations = () => {
	const {
		data: s3Destinations,
		isLoading: isLoadingS3,
		refetch: refetchS3,
	} = api.destination.all.useQuery();
	const {
		data: cloudDestinations,
		isLoading: isLoadingCloud,
		refetch: refetchCloud,
	} = api.cloudStorageDestination.all.useQuery();

	const destinations = [
		...(s3Destinations || []).map((s3) => ({
			...s3,
			isCloudStorage: false,
		})),
		...(cloudDestinations || []).map((cloud) => ({
			destinationId: cloud.id,
			name: cloud.name,
			provider: cloud.provider,
			createdAt: cloud.createdAt,
			isCloudStorage: true,
		})),
	];

	const isLoading = isLoadingS3 || isLoadingCloud;
	const { mutateAsync: removeS3Destination, isLoading: isRemovingS3 } =
		api.destination.remove.useMutation();
	const { mutateAsync: removeCloudDestination, isLoading: isRemovingCloud } =
		api.cloudStorageDestination.delete.useMutation();

	const handleDelete = async (
		destinationId: string,
		isCloudStorage: boolean,
	) => {
		try {
			if (isCloudStorage) {
				await removeCloudDestination({ destinationId });
			} else {
				await removeS3Destination({ destinationId });
			}
			toast.success("Destination deleted successfully");
			await refetchS3();
			await refetchCloud();
		} catch (_err: any) {
			toast.error("Cannot delete destination", {
				description:
					"You must delete all backups associated with this destination before deleting the destination.",
			});
		}
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Database className="size-6 text-muted-foreground self-center" />
							Backup Destinations
						</CardTitle>
						<CardDescription>
							Configure storage providers for your backups including
							S3-compatible services, Google Drive, Dropbox, Box and more.
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
								{destinations?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<FolderUp className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											To create a backup it is required to set at least 1
											storage provider.
										</span>
										<div className="flex flex-row gap-2">
											<HandleDestinations />
										</div>
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg">
											{destinations?.map((destination, index) => {
												const isCloud = isCloudStorageProvider(
													destination.provider || "",
												);

												return (
													<div
														key={destination.destinationId}
														className="flex flex-col bg-sidebar p-1 w-full rounded-lg"
													>
														<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
															<div className="flex flex-col gap-1">
																<div className="flex items-center gap-2">
																	<span className="text-sm">
																		{index + 1}. {destination.name}
																		{destination.provider && (
																			<span className="ml-2 text-xs text-muted-foreground">
																				({destination.provider})
																			</span>
																		)}
																	</span>
																</div>
																<span className="text-xs text-muted-foreground">
																	Created at:{" "}
																	{destination.createdAt
																		? new Date(
																				destination.createdAt,
																			).toLocaleDateString()
																		: "N/A"}
																</span>
															</div>
															<div className="flex flex-row gap-1">
																{isCloud ? (
																	<HandleDestinations
																		cloudDestinationId={
																			destination.destinationId
																		}
																		type="cloud"
																	/>
																) : (
																	<HandleDestinations
																		destinationId={destination.destinationId}
																		type="s3"
																	/>
																)}
																<DialogAction
																	title="Delete Destination"
																	description="Are you sure you want to delete this destination?"
																	type="destructive"
																	onClick={async () => {
																		await handleDelete(
																			destination.destinationId,
																			isCloud,
																		);
																	}}
																>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="group hover:bg-red-500/10"
																		isLoading={isRemovingS3 || isRemovingCloud}
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
