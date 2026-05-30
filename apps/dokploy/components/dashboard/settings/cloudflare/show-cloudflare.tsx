import { Cloud, CloudOff, Loader2, Trash2 } from "lucide-react";
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
import { HandleCloudflare } from "./handle-cloudflare";

export const ShowCloudflare = () => {
	const { data, isPending, refetch } = api.cloudflare.all.useQuery();
	const { mutateAsync, isPending: isRemoving } =
		api.cloudflare.remove.useMutation();
	const { data: permissions } = api.user.getPermissions.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Cloud className="size-6 text-muted-foreground self-center" />
							Cloudflare Tunnel & Access
						</CardTitle>
						<CardDescription>
							Connect Cloudflare accounts to publish domains through Cloudflare
							Tunnel and protect them with Cloudflare Access.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<CloudOff className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											Add a Cloudflare integration to start publishing domains.
										</span>
										{permissions?.cloudflare.create && <HandleCloudflare />}
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg">
											{data?.map((integration, index) => (
												<div
													key={integration.cloudflareId}
													className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
														<div className="flex flex-col gap-1">
															<span className="text-sm">
																{index + 1}. {integration.name}
															</span>
															<span className="text-xs text-muted-foreground">
																Account: {integration.accountId}
															</span>
														</div>
														<div className="flex flex-row gap-1">
															{permissions?.cloudflare.update && (
																<HandleCloudflare
																	cloudflareId={integration.cloudflareId}
																/>
															)}
															{permissions?.cloudflare.delete && (
																<DialogAction
																	title="Delete Cloudflare Integration"
																	description="Are you sure you want to delete this Cloudflare integration?"
																	type="destructive"
																	onClick={async () => {
																		await mutateAsync({
																			cloudflareId: integration.cloudflareId,
																		})
																			.then(() => {
																				toast.success(
																					"Cloudflare integration deleted successfully",
																				);
																				refetch();
																			})
																			.catch(() => {
																				toast.error(
																					"Error deleting Cloudflare integration",
																				);
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
															)}
														</div>
													</div>
												</div>
											))}
										</div>

										{permissions?.cloudflare.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleCloudflare />
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
