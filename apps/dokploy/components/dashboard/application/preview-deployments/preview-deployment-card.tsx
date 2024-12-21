import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Clock, GitBranch, GitPullRequest } from "lucide-react";
import Link from "next/link";
import { ShowModalLogs } from "../../settings/web-server/show-modal-logs";
import { DialogAction } from "@/components/shared/dialog-action";
import { api } from "@/utils/api";
import { ShowPreviewBuilds } from "./show-preview-builds";
import { DateTooltip } from "@/components/shared/date-tooltip";

interface PreviewDeploymentCardProps {
	deploymentId: string;
	serverId: string;
	onDeploymentDelete: (deploymentId: string) => void;
	isLoading: boolean;
}

export function PreviewDeploymentCard({
	deploymentId,
	serverId,
	onDeploymentDelete,
	isLoading,
}: PreviewDeploymentCardProps) {
	const { data: previewDeployment } = api.previewDeployment.one.useQuery({
		previewDeploymentId: deploymentId,
	});

	if (!previewDeployment) return null;

	return (
		<div className="w-full border rounded-xl">
			<div className="p-6 flex flex-row items-center justify-between">
				<span className="text-lg font-bold">{previewDeployment.pullRequestTitle}</span>
				<Badge variant="outline" className="text-sm font-medium gap-x-2">
					{previewDeployment.previewStatus || "Idle"}
				</Badge>
			</div>
			<div className="p-6 pt-0 space-y-4">
				<div className="flex sm:flex-row flex-col items-center gap-2">
					<Link
						href={`http://${previewDeployment.domain?.host}`}
						target="_blank"
						className="text-sm text-blue-500/95 hover:underline"
					>
						{previewDeployment.domain?.host}
					</Link>
				</div>
				<div className="flex sm:flex-row text-sm flex-col items-center justify-between">
					<div className="flex items-center space-x-2">
						<GitBranch className="h-5 w-5 text-gray-400" />
						<span>Branch:</span>
						<Badge className="p-2" variant={"blank"}>
							{previewDeployment.branch}
						</Badge>
					</div>
					<div className="flex items-center space-x-2">
						<Clock className="h-5 w-5 text-gray-400" />
						<span>Deployed:</span>
						<Badge className="p-2" variant={"blank"}>
              <DateTooltip date={previewDeployment.createdAt} />
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
							href={previewDeployment.pullRequestURL}
						>
							{previewDeployment.pullRequestTitle}
						</Link>
					</div>
				</div>
			</div>
			<div className="justify-center flex-wrap p-6 pt-0">
				<div className="flex flex-wrap justify-end gap-2">
          <ShowPreviewBuilds deployments={previewDeployment.deployments || []} serverId={serverId} />
					<ShowModalLogs appName={previewDeployment.appName} serverId={serverId}>
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