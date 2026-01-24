import { formatDistanceToNow } from "date-fns";
import { KeyRound, Trash2 } from "lucide-react";
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
import { HandleSSHKeys } from "./handle-ssh-keys";

export const ShowDestinations = () => {
	const { data, isLoading, refetch } = api.sshKey.all.useQuery();
	const { mutateAsync, isLoading: isRemoving } =
		api.sshKey.remove.useMutation();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<KeyRound className="size-6 text-muted-foreground self-center" />
							SSH Keys
						</CardTitle>
						<CardDescription>
							Create and manage SSH Keys, you can use them to access your
							servers, git private repositories, and more.
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
												<KeyRound className="size-5 text-muted-foreground" />
											</EmptyMedia>
											<EmptyTitle>No SSH keys yet</EmptyTitle>
											<EmptyDescription>
												Add an SSH key to connect servers and private repos.
											</EmptyDescription>
										</EmptyHeader>
										<EmptyContent>
											<HandleSSHKeys />
										</EmptyContent>
									</Empty>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg ">
											{data?.map((sshKey, index) => (
												<div
													key={sshKey.sshKeyId}
													className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border  w-full">
														<div className="flex items-center justify-between">
															<div className="flex flex-col">
																<span className="text-sm font-medium">
																	{index + 1}. {sshKey.name}
																</span>
																{sshKey.description && (
																	<div>
																		<span className="text-xs text-muted-foreground">
																			{sshKey.description}
																		</span>
																		<div className="text-xs  text-muted-foreground">
																			Created:{" "}
																			{formatDistanceToNow(
																				new Date(sshKey.createdAt),
																				{
																					addSuffix: true,
																				},
																			)}
																		</div>
																	</div>
																)}
															</div>
														</div>

														<div className="flex flex-row gap-1">
															<HandleSSHKeys sshKeyId={sshKey.sshKeyId} />

															<DialogAction
																title="Delete SSH Key"
																description="Are you sure you want to delete this SSH Key?"
																type="destructive"
																onClick={async () => {
																	await mutateAsync({
																		sshKeyId: sshKey.sshKeyId,
																	})
																		.then(() => {
																			toast.success(
																				"SSH Key deleted successfully",
																			);
																			refetch();
																		})
																		.catch(() => {
																			toast.error("Error deleting SSH Key");
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
											<HandleSSHKeys />
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
