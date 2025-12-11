import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN, zhTW } from "date-fns/locale";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "next-i18next";
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
	const { t, i18n } = useTranslation("settings");
	const { data, isLoading, refetch } = api.sshKey.all.useQuery();
	const { mutateAsync, isLoading: isRemoving } =
		api.sshKey.remove.useMutation();

	const locale =
		i18n?.language === "zh-Hans"
			? zhCN
			: i18n?.language === "zh-Hant"
				? zhTW
				: enUS;

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<KeyRound className="size-6 text-muted-foreground self-center" />
							{t("settings.sshKeys.page.title")}
						</CardTitle>
						<CardDescription>
							{t("settings.sshKeys.page.description")}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>{t("settings.common.loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<KeyRound className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											{t("settings.sshKeys.page.empty")}
										</span>
										<HandleSSHKeys />
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
																			{t("settings.sshKeys.page.createdLabel")}{" "}
																			{formatDistanceToNow(
																				new Date(sshKey.createdAt),
																				{
																					addSuffix: true,
																					locale,
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
																title={t("settings.sshKeys.delete.title")}
																description={t(
																	"settings.sshKeys.delete.description",
																)}
																type="destructive"
																onClick={async () => {
																	await mutateAsync({
																		sshKeyId: sshKey.sshKeyId,
																	})
																		.then(() => {
																			toast.success(
																				t("settings.sshKeys.delete.success"),
																			);
																			refetch();
																		})
																		.catch(() => {
																			toast.error(
																				t("settings.sshKeys.delete.error"),
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
