import { DateTooltip } from "@/components/shared/date-tooltip";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { Pencil, RocketIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShowDeployment } from "../deployments/show-deployment";
import Link from "next/link";
import { ShowModalLogs } from "../../settings/web-server/show-modal-logs";
import { DialogAction } from "@/components/shared/dialog-action";
import { AddPreviewDomain } from "./add-preview-domain";
import { GithubIcon } from "@/components/icons/data-tools-icons";
import { ShowPreviewSettings } from "./show-preview-settings";
import { ShowPreviewBuilds } from "./show-preview-builds";

interface Props {
	applicationId: string;
}

export const ShowPreviewDeployments = ({ applicationId }: Props) => {
	const [activeLog, setActiveLog] = useState<string | null>(null);
	const { data } = api.application.one.useQuery({ applicationId });

	const { mutateAsync: deletePreviewDeployment, isLoading } =
		api.previewDeployment.delete.useMutation();
	const { data: previewDeployments, refetch: refetchPreviewDeployments } =
		api.previewDeployment.all.useQuery(
			{ applicationId },
			{
				enabled: !!applicationId,
			},
		);
	// const [url, setUrl] = React.useState("");
	// useEffect(() => {
	// 	setUrl(document.location.origin);
	// }, []);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Preview Deployments</CardTitle>
					<CardDescription>See all the preview deployments</CardDescription>
				</div>
				{data?.isPreviewDeploymentsActive && (
					<ShowPreviewSettings applicationId={applicationId} />
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.isPreviewDeploymentsActive ? (
					<>
						<div className="flex flex-col gap-2 text-sm">
							<span>
								Preview deployments are a way to test your application before it
								is deployed to production. It will create a new deployment for
								each pull request you create.
							</span>
						</div>
						{data?.previewDeployments?.length === 0 ? (
							<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
								<RocketIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									No preview deployments found
								</span>
							</div>
						) : (
							<div className="flex flex-col gap-4">
								{previewDeployments?.map((previewDeployment) => {
									const { deployments, domain } = previewDeployment;

									return (
										<div
											key={previewDeployment?.previewDeploymentId}
											className="flex flex-col  justify-between rounded-lg border p-4 gap-2"
										>
											<div className="flex justify-between gap-2 max-sm:flex-wrap">
												<div className="flex flex-col gap-2">
													{deployments?.length === 0 ? (
														<div>
															<span className="text-sm text-muted-foreground">
																No deployments found
															</span>
														</div>
													) : (
														<div className="flex items-center gap-2">
															<span className="flex items-center gap-4 font-medium capitalize text-foreground">
																{previewDeployment?.pullRequestTitle}
															</span>
															<StatusTooltip
																status={previewDeployment.previewStatus}
																className="size-2.5"
															/>
														</div>
													)}
													<div className="flex flex-col gap-1">
														{previewDeployment?.pullRequestTitle && (
															<div className="flex items-center gap-2">
																<span className="break-all text-sm text-muted-foreground w-fit">
																	Title: {previewDeployment?.pullRequestTitle}
																</span>
															</div>
														)}

														{previewDeployment?.pullRequestURL && (
															<div className="flex items-center gap-2">
																<GithubIcon />
																<Link
																	target="_blank"
																	href={previewDeployment?.pullRequestURL}
																	className="break-all text-sm text-muted-foreground w-fit hover:underline hover:text-foreground"
																>
																	Pull Request URL
																</Link>
															</div>
														)}
													</div>
													<div className="flex flex-col ">
														<span>Domain </span>
														<div className="flex flex-row items-center gap-4">
															<Link
																target="_blank"
																href={`http://${domain?.host}`}
																className="text-sm text-muted-foreground w-fit hover:underline hover:text-foreground"
															>
																{domain?.host}
															</Link>
															<AddPreviewDomain
																previewDeploymentId={
																	previewDeployment.previewDeploymentId
																}
																domainId={domain?.domainId}
															>
																<Button variant="outline" size="sm">
																	<Pencil className="size-4 text-muted-foreground" />
																</Button>
															</AddPreviewDomain>
														</div>
													</div>
												</div>

												<div className="flex flex-col sm:items-end gap-2 max-sm:w-full">
													{previewDeployment?.createdAt && (
														<div className="text-sm capitalize text-muted-foreground">
															<DateTooltip
																date={previewDeployment?.createdAt}
															/>
														</div>
													)}
													<ShowPreviewBuilds
														deployments={previewDeployment?.deployments || []}
														serverId={data?.serverId || ""}
													/>

													<ShowModalLogs
														appName={previewDeployment.appName}
														serverId={data?.serverId || ""}
													>
														<Button variant="outline">View Logs</Button>
													</ShowModalLogs>

													<DialogAction
														title="Delete Preview"
														description="Are you sure you want to delete this preview?"
														onClick={() => {
															deletePreviewDeployment({
																previewDeploymentId:
																	previewDeployment.previewDeploymentId,
															})
																.then(() => {
																	refetchPreviewDeployments();
																	toast.success("Preview deployment deleted");
																})
																.catch((error) => {
																	toast.error(error.message);
																});
														}}
													>
														<Button variant="destructive" isLoading={isLoading}>
															Delete Preview
														</Button>
													</DialogAction>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</>
				) : (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<RocketIcon className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							Preview deployments are disabled for this application, please
							enable it
						</span>
						<ShowPreviewSettings applicationId={applicationId} />
					</div>
				)}
			</CardContent>
		</Card>
	);
};
