import { AlertCircle, Link, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { AddCertificate } from "./add-certificate";
import { getCertificateChainInfo, getExpirationStatus } from "./utils";

export const ShowCertificates = () => {
	const { t } = useTranslation("settings");
	const { mutateAsync, isLoading: isRemoving } =
		api.certificates.remove.useMutation();
	const { data, isLoading, refetch } = api.certificates.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<ShieldCheck className="size-6 text-muted-foreground self-center" />
							{t("settings.certificates.page.title")}
						</CardTitle>
						<CardDescription>
							{t("settings.certificates.page.description")}
						</CardDescription>

						<AlertBlock type="warning">
							{t("settings.certificates.page.warning")}
						</AlertBlock>
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
										<ShieldCheck className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											{t("settings.certificates.page.empty")}
										</span>
										<AddCertificate />
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg ">
											{data?.map((certificate, index) => {
												const expiration = getExpirationStatus(
													certificate.certificateData,
												);
												const chainInfo = getCertificateChainInfo(
													certificate.certificateData,
												);
												return (
													<div
														key={certificate.certificateId}
														className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
													>
														<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border  w-full">
															<div className="flex items-center justify-between">
																<div className="flex gap-2 flex-col">
																	<span className="text-sm font-medium">
																		{index + 1}. {certificate.name}
																	</span>
																	{chainInfo.isChain && (
																		<div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50">
																			<Link className="size-3 text-muted-foreground" />
																			<span className="text-xs text-muted-foreground">
																				{t("settings.certificates.page.chainLabel", {
																					count: chainInfo.count,
																				})}
																			</span>
																		</div>
																	)}
																	<div
																		className={`text-xs flex items-center gap-1.5 ${expiration.className}`}
																	>
																		{expiration.status !== "valid" && (
																			<AlertCircle className="size-3" />
																		)}
																		{expiration.message}
																		{certificate.autoRenew &&
																			expiration.status !== "valid" && (
																				<span className="text-xs text-emerald-500 ml-1">
																					{t("settings.certificates.page.autoRenewEnabled")}
																				</span>
																			)}
																	</div>
																</div>
															</div>

															<div className="flex flex-row gap-1">
																<DialogAction
																	title={t("settings.certificates.page.delete.title")}
																	description={t("settings.certificates.page.delete.description")}
																	type="destructive"
																	onClick={async () => {
																		await mutateAsync({
																			certificateId: certificate.certificateId,
																		})
																			.then(() => {
																				toast.success(
																					t("settings.certificates.page.deleteSuccess"),
																				);
																				refetch();
																			})
																			.catch(() => {
																				toast.error(
																					t("settings.certificates.page.deleteError"),
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
												);
											})}
										</div>

										<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
											<AddCertificate />
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
