import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  GitBranch,
  GitPullRequest,
  Pencil,
  RocketIcon,
} from "lucide-react";
import Link from "next/link";
import { ShowModalLogs } from "../../settings/web-server/show-modal-logs";
import { DialogAction } from "@/components/shared/dialog-action";
import { api } from "@/utils/api";
import { ShowPreviewBuilds } from "./show-preview-builds";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { toast } from "sonner";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { AddPreviewDomain } from "./add-preview-domain";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShowPreviewSettings } from "./show-preview-settings";

interface Props {
  applicationId: string;
}

export const ShowPreviewDeployments = ({ applicationId }: Props) => {
  const { data } = api.application.one.useQuery({ applicationId });

  const { mutateAsync: deletePreviewDeployment, isLoading } =
    api.previewDeployment.delete.useMutation();

  const { data: previewDeployments, refetch: refetchPreviewDeployments } =
    api.previewDeployment.all.useQuery(
      { applicationId },
      {
        enabled: !!applicationId,
      }
    );

  const handleDeletePreviewDeployment = async (previewDeploymentId: string) => {
    deletePreviewDeployment({
      previewDeploymentId: previewDeploymentId,
    })
      .then(() => {
        refetchPreviewDeployments();
        toast.success("Preview deployment deleted");
      })
      .catch((error) => {
        toast.error(error.message);
      });
  };

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
            {!previewDeployments?.length ? (
              <div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
                <RocketIcon className="size-8 text-muted-foreground" />
                <span className="text-base text-muted-foreground">
                  No preview deployments found
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {previewDeployments.map((previewDeployment) => (
                  <div
                    key={previewDeployment.previewDeploymentId}
                    className="w-full border rounded-xl"
                  >
                    <div className="md:p-6 p-2 md:pb-3 flex flex-row items-center justify-between">
                      <span className="text-lg font-bold">
                        {previewDeployment.pullRequestTitle}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-sm font-medium gap-x-2"
                      >
                        <StatusTooltip
                          status={previewDeployment.previewStatus}
                          className="size-2.5"
                        />
                        {previewDeployment.previewStatus
                          ?.replace("running", "Running")
                          .replace("done", "Done")
                          .replace("error", "Error")
                          .replace("idle", "Idle") || "Idle"}
                      </Badge>
                    </div>

                    <div className="md:p-6 p-2 md:pt-0 space-y-4">
                      <div className="flex sm:flex-row flex-col items-center gap-2">
                        <Link
                          href={`http://${previewDeployment.domain?.host}`}
                          target="_blank"
                          className="text-sm text-blue-500/95 hover:underline gap-2 flex w-full sm:flex-row flex-col items-center justify-between rounded-lg border p-2"
                        >
                          {previewDeployment.domain?.host}
                        </Link>

                        <AddPreviewDomain
                          previewDeploymentId={
                            previewDeployment.previewDeploymentId
                          }
                          domainId={previewDeployment.domain?.domainId}
                        >
                          <Button
                            className="sm:w-auto w-full"
                            size="sm"
                            variant="outline"
                          >
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                        </AddPreviewDomain>
                      </div>

                      <div className="flex sm:flex-row text-sm flex-col items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <GitBranch className="size-5 text-gray-400" />
                          <span>Branch:</span>
                          <Badge className="p-2" variant="blank">
                            {previewDeployment.branch}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="size-5 text-gray-400" />
                          <span>Deployed:</span>
                          <Badge className="p-2" variant="blank">
                            <DateTooltip date={previewDeployment.createdAt} />
                          </Badge>
                        </div>
                      </div>

                      <Separator />

                      <div className="rounded-lg bg-muted p-4">
                        <h3 className="mb-2 text-sm font-medium">
                          Pull Request
                        </h3>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <GitPullRequest className="size-5 text-gray-400" />
                          <Link
                            className="hover:text-blue-500/95 hover:underline"
                            target="_blank"
                            href={previewDeployment.pullRequestURL}
                          >
                            {previewDeployment.pullRequestTitle}
                          </Link>
                        </div>
                      </div>
                    </div>

                    <div className="justify-center flex-wrap md:p-6 p-2 md:pt-0">
                      <div className="flex flex-wrap justify-end gap-2">
                        <ShowModalLogs
                          appName={previewDeployment.appName}
                          serverId={data?.serverId || ""}
                        >
                          <Button
                            className="sm:w-auto w-full"
                            variant="outline"
                            size="sm"
                          >
                            View Logs
                          </Button>
                        </ShowModalLogs>

                        <ShowPreviewBuilds
                          deployments={previewDeployment.deployments || []}
                          serverId={data?.serverId || ""}
                        />

                        <DialogAction
                          title="Delete Preview"
                          description="Are you sure you want to delete this preview?"
                          onClick={() =>
                            handleDeletePreviewDeployment(
                              previewDeployment.previewDeploymentId
                            )
                          }
                        >
                          <Button
                            className="sm:w-auto w-full"
                            variant="destructive"
                            isLoading={isLoading}
                            size="sm"
                          >
                            Delete Preview
                          </Button>
                        </DialogAction>
                      </div>
                    </div>
                  </div>
                ))}
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
