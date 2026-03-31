import { Loader2, TagIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { TagBadge } from "@/components/shared/tag-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { HandleTag } from "./handle-tag";

export const TagManager = () => {
	const utils = api.useUtils();
	const { data: tags, isPending } = api.tag.all.useQuery();
	const { mutateAsync: deleteTag, isPending: isRemoving } =
		api.tag.remove.useMutation();
	const { data: permissions } = api.user.getPermissions.useQuery();

	return (
		<div className="w-full">
			<div>
				<div>
					<h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
						<TagIcon className="size-5 text-muted-foreground" />
						Tags
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Create and manage tags to organize your projects
					</p>
					<div className="space-y-2 pt-6">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{!tags || tags.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<TagIcon className="size-6 text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											No tags yet. Create your first tag to start organizing
											projects.
										</span>
										{permissions?.tag.create && <HandleTag />}
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg">
											{tags.map((tag) => (
												<div
													key={tag.tagId}
													className="flex items-center justify-between p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
														<div className="flex items-center gap-3">
															<TagBadge name={tag.name} color={tag.color} />
															{tag.color && (
																<span className="text-xs text-muted-foreground font-mono">
																	{tag.color}
																</span>
															)}
														</div>
														<div className="flex flex-row gap-1 items-center">
															{permissions?.tag.update && (
																<HandleTag tagId={tag.tagId} />
															)}
															{permissions?.tag.delete && (
																<DialogAction
																	title="Delete Tag"
																	description={`Are you sure you want to delete the tag "${tag.name}"? This will remove the tag from all projects. This action cannot be undone.`}
																	type="destructive"
																	onClick={async () => {
																		await deleteTag({
																			tagId: tag.tagId,
																		})
																			.then(async () => {
																				await utils.tag.all.invalidate();
																				toast.success(
																					"Tag deleted successfully",
																				);
																			})
																			.catch(() => {
																				toast.error("Error deleting tag");
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

										{permissions?.tag.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleTag />
											</div>
										)}
									</div>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
