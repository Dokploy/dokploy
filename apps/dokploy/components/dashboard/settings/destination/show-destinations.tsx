import { Database, FolderUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { ListSkeleton } from "@/components/shared/list-skeleton";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { api } from "@/utils/api";
import { HandleDestinations } from "./handle-destinations";

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
							S3 Destinations
						</CardTitle>
						<CardDescription>
							Add your providers like AWS S3, Cloudflare R2, Wasabi,
							DigitalOcean Spaces etc.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<ListSkeleton
								items={3}
								gridClassName="grid grid-cols-1 gap-3"
							/>
						) : (
							<>
								{data?.length === 0 ? (
									<Empty className="min-h-[25vh]">
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<FolderUp className="size-5 text-muted-foreground" />
											</EmptyMedia>
											<EmptyTitle>No destinations yet</EmptyTitle>
											<EmptyDescription>
												Add at least one provider to enable backups.
											</EmptyDescription>
										</EmptyHeader>
										<EmptyContent>
											<HandleDestinations />
										</EmptyContent>
									</Empty>
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
															<span className="text-sm">
																{index + 1}. {destination.name}
															</span>
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
