import { Loader2, Package, Trash2 } from "lucide-react";
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
import { HandleRegistry } from "./handle-registry";

export const ShowRegistry = () => {
	const { mutateAsync, isLoading: isRemoving } =
		api.registry.remove.useMutation();
	const { data, isLoading, refetch } = api.registry.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Package className="size-6 text-muted-foreground self-center" />
							Docker Registry
						</CardTitle>
						<CardDescription>
							Manage your Docker Registry configurations
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
										<Package className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											You don't have any registry configurations
										</span>
										<HandleRegistry />
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg ">
											{data?.map((registry, index) => (
												<div
													key={registry.registryId}
													className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border  w-full">
														<div className="flex items-center justify-between">
															<div className="flex gap-2 flex-col">
																<span className="text-sm font-medium">
																	{index + 1}. {registry.registryName}
																</span>
																{registry.registryUrl && (
																	<div className="text-xs text-muted-foreground">
																		{registry.registryUrl}
																	</div>
																)}
															</div>
														</div>

														<div className="flex flex-row gap-1">
															<HandleRegistry
																registryId={registry.registryId}
															/>

															<DialogAction
																title="Delete Registry"
																description="Are you sure you want to delete this registry configuration?"
																type="destructive"
																onClick={async () => {
																	await mutateAsync({
																		registryId: registry.registryId,
																	})
																		.then(() => {
																			toast.success(
																				"Registry configuration deleted successfully",
																			);
																			refetch();
																		})
																		.catch(() => {
																			toast.error(
																				"Error deleting registry configuration",
																			);
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
											<HandleRegistry />
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
