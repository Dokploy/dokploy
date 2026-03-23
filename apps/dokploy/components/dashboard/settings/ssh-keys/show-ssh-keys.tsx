import { formatDistanceToNow } from "date-fns";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { HandleSSHKeys } from "./handle-ssh-keys";

export const ShowDestinations = () => {
	const t = useTranslations("settingsSshKeys");
	const { data, isPending, refetch } = api.sshKey.all.useQuery();
	const { mutateAsync, isPending: isRemoving } =
		api.sshKey.remove.useMutation();
	const { data: permissions } = api.user.getPermissions.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<KeyRound className="size-6 text-muted-foreground self-center" />
							{t("title")}
						</CardTitle>
						<CardDescription>
							{t("description")}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>{t("loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<KeyRound className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											{t("emptyState")}
										</span>
										{permissions?.sshKeys.create && <HandleSSHKeys />}
									</div>
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
																			{t("createdLabel")}{" "}
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

															{permissions?.sshKeys.delete && (
																<DialogAction
																	title={t("deleteTitle")}
																	description={t("deleteDescription")}
																	type="destructive"
																	onClick={async () => {
																		await mutateAsync({
																			sshKeyId: sshKey.sshKeyId,
																		})
																			.then(() => {
																				toast.success(
																					t("deletedSuccess"),
																				);
																				refetch();
																			})
																			.catch(() => {
																				toast.error(t("deleteError"));
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
															)}
														</div>
													</div>
												</div>
											))}
										</div>

										{permissions?.sshKeys.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleSSHKeys />
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
