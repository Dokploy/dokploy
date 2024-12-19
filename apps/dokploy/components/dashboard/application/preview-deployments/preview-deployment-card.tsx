import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Clock, GitBranch, GitPullRequest, Pencil } from "lucide-react";
import Link from "next/link";
import { ShowModalLogs } from "../../settings/web-server/show-modal-logs";
import { DialogAction } from "@/components/shared/dialog-action";
import { ShowPreviewBuilds } from "./show-preview-builds";
import { RouterOutputs } from "@/utils/api";
import { AddPreviewDomain } from "./add-preview-domain";
import { DateTooltip } from "@/components/shared/date-tooltip";

interface PreviewDeploymentCardProps {
  appName: string;
  serverId: string | undefined;
  onDeploymentDelete: (deploymentId: string) => void;
  deploymentId: string;
  deploymentUrl: string;
  deployments: RouterOutputs["deployment"]["all"];

  domainId: string | undefined;
  domainHost: string | undefined;

  pullRequestTitle: string | undefined;
  pullRequestUrl: string | undefined;
  status: "running" | "error" | "done" | "idle" | undefined | null;
  branch: string | undefined;
  date: string | undefined;
  isLoading: boolean;
}

export function PreviewDeploymentCard({
  appName,
  serverId,

  onDeploymentDelete,
  deploymentId,
  deployments,

  domainId,
  domainHost,

  pullRequestTitle,
  pullRequestUrl,
  isLoading,
  status,
  branch,
  date,
}: PreviewDeploymentCardProps) {
  return (
    <div className="w-full border rounded-xl">
      <div className="p-6 flex flex-row items-center justify-between">
        <span className="text-lg font-bold">{pullRequestTitle}</span>
        <Badge variant="outline" className="text-sm font-medium gap-x-2">
          <StatusTooltip status={status} className="size-2.5" />
          {status
            ?.replace("running", "Running")
            .replace("done", "Done")
            .replace("error", "Error")
            .replace("idle", "Idle") || "Idle"}
        </Badge>
      </div>
      <div className="p-6 pt-0 space-y-4">
        <div className="flex sm:flex-row flex-col items-center gap-2">
          <div className="gap-2 flex w-full sm:flex-row flex-col items-center justify-between rounded-lg border p-2">
            <Link href={`http://${domainHost}`} target="_blank" className="text-sm text-blue-500/95 hover:underline">
              {domainHost}
            </Link>
          </div>
          <AddPreviewDomain
            previewDeploymentId={deploymentId}
            domainId={domainId}
          >
            <Button className="sm:w-auto w-full" size="sm" variant="outline">
              <Pencil className="mr-2 size-4" />
              Edit
            </Button>
          </AddPreviewDomain>
        </div>
        <div className="flex sm:flex-row text-sm flex-col items-center justify-between">
          <div className="flex items-center space-x-2">
            <GitBranch className="h-5 w-5 text-gray-400" />
            <span>Branch:</span>
            <Badge className="p-2" variant={"blank"}>
              {" "}
              {branch}
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-gray-400" />
            <span>Deployed: </span>
            <Badge className="p-2" variant={"blank"}>
              <DateTooltip date={date} />
            </Badge>
          </div>
        </div>
        <Separator />
        <div className="rounded-lg bg-muted p-4">
          <h3 className="mb-2 text-sm font-medium">Pull Request</h3>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <GitPullRequest className="h-5 w-5 text-gray-400" />
            <Link
              className="hover:text-blue-500/95 hover:underline"
              target="_blank"
              href={pullRequestUrl}
            >
              {pullRequestTitle}
            </Link>
          </div>
        </div>
      </div>
      <div className="justify-center flex-wrap p-6 pt-0">
        <div className="flex flex-wrap justify-end gap-2">
          <ShowPreviewBuilds deployments={deployments} serverId={serverId} />

          <ShowModalLogs appName={appName} serverId={serverId}>
            <Button className="sm:w-auto w-full" variant="outline" size="sm">
              View Logs
            </Button>
          </ShowModalLogs>

          <DialogAction
            title="Delete Preview"
            description="Are you sure you want to delete this preview?"
            onClick={() => onDeploymentDelete(deploymentId)}
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
  );
}