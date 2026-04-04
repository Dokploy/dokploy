import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Ban, CheckCircle2, History, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

interface Props {
  composeId: string;
}
export const ComposeActions = ({ composeId }: Props) => {
  const router = useRouter();
  const { data: permissions } = api.user.getPermissions.useQuery();
  const canDeploy = permissions?.deployment.create ?? false;
  const canUpdateService = permissions?.service.create ?? false;
  const { data, refetch } = api.compose.one.useQuery(
    {
      composeId,
    },
    { enabled: !!composeId },
  );
  const { mutateAsync: update } = api.compose.update.useMutation();
  const { mutateAsync: deploy } = api.compose.deploy.useMutation();
  const { mutateAsync: redeploy } = api.compose.redeploy.useMutation();
  const { mutateAsync: start, isPending: isStarting } =
    api.compose.start.useMutation();
  const { mutateAsync: stop, isPending: isStopping } =
    api.compose.stop.useMutation();
  const [commitHash, setCommitHash] = useState("");
  const normalizedCommitHash = commitHash.trim().toLowerCase();
  const hasValidCommitHash = /^[a-f0-9]{7,40}$/.test(normalizedCommitHash);
  const configuredBranch = (() => {
    switch (data?.sourceType) {
      case "github":
        return data.branch;
      case "gitlab":
        return data.gitlabBranch;
      case "bitbucket":
        return data.bitbucketBranch;
      case "gitea":
        return data.giteaBranch;
      case "git":
        return data.customGitBranch;
      default:
        return "";
    }
  })();

  const { data: githubBranches, isFetching: isFetchingGithubBranches } =
    api.github.getGithubBranches.useQuery(
      {
        owner: data?.owner || "",
        repo: data?.repository || "",
        githubId: data?.githubId || "",
      },
      {
        enabled:
          hasValidCommitHash &&
          data?.sourceType === "github" &&
          !!data?.owner &&
          !!data?.repository &&
          !!data?.githubId,
      },
    );

  const { data: gitlabBranches, isFetching: isFetchingGitlabBranches } =
    api.gitlab.getGitlabBranches.useQuery(
      {
        owner: data?.gitlabOwner || "",
        repo: data?.gitlabRepository || "",
        id: data?.gitlabProjectId || 0,
        gitlabId: data?.gitlabId || "",
      },
      {
        enabled:
          hasValidCommitHash &&
          data?.sourceType === "gitlab" &&
          !!data?.gitlabOwner &&
          !!data?.gitlabRepository &&
          !!data?.gitlabProjectId &&
          !!data?.gitlabId,
      },
    );

  const { data: bitbucketBranches, isFetching: isFetchingBitbucketBranches } =
    api.bitbucket.getBitbucketBranches.useQuery(
      {
        owner: data?.bitbucketOwner || "",
        repo: data?.bitbucketRepositorySlug || data?.bitbucketRepository || "",
        bitbucketId: data?.bitbucketId || "",
      },
      {
        enabled:
          hasValidCommitHash &&
          data?.sourceType === "bitbucket" &&
          !!data?.bitbucketOwner &&
          !!(data?.bitbucketRepositorySlug || data?.bitbucketRepository) &&
          !!data?.bitbucketId,
      },
    );

  const { data: giteaBranches, isFetching: isFetchingGiteaBranches } =
    api.gitea.getGiteaBranches.useQuery(
      {
        owner: data?.giteaOwner || "",
        repositoryName: data?.giteaRepository || "",
        giteaId: data?.giteaId || "",
      },
      {
        enabled:
          hasValidCommitHash &&
          data?.sourceType === "gitea" &&
          !!data?.giteaOwner &&
          !!data?.giteaRepository &&
          !!data?.giteaId,
      },
    );

  const matchingBranches = (() => {
    if (!hasValidCommitHash) {
      return [] as string[];
    }

    if (data?.sourceType === "github") {
      return (githubBranches || [])
        .filter((branch) =>
          branch.commit.sha.toLowerCase().startsWith(normalizedCommitHash),
        )
        .map((branch) => branch.name);
    }

    if (data?.sourceType === "gitlab") {
      return (gitlabBranches || [])
        .filter((branch) =>
          branch.commit.id.toLowerCase().startsWith(normalizedCommitHash),
        )
        .map((branch) => branch.name);
    }

    if (data?.sourceType === "bitbucket") {
      return (bitbucketBranches || [])
        .filter((branch) =>
          branch.commit.sha.toLowerCase().startsWith(normalizedCommitHash),
        )
        .map((branch) => branch.name);
    }

    if (data?.sourceType === "gitea") {
      return (giteaBranches || [])
        .filter((branch) =>
          branch.commit.id.toLowerCase().startsWith(normalizedCommitHash),
        )
        .map((branch) => branch.name);
    }

    return [] as string[];
  })();

  const isLoadingBranchInfo =
    isFetchingGithubBranches ||
    isFetchingGitlabBranches ||
    isFetchingBitbucketBranches ||
    isFetchingGiteaBranches;

  const hasGitSource =
    data?.sourceType === "github" ||
    data?.sourceType === "gitlab" ||
    data?.sourceType === "bitbucket" ||
    data?.sourceType === "gitea" ||
    data?.sourceType === "git";

  const [gitHistoryOpen, setGitHistoryOpen] = useState(false);

  const { data: gitHistory, isFetching: isFetchingGitHistory } =
    api.compose.getGitHistory.useQuery(
      { composeId, limit: 10 },
      { enabled: gitHistoryOpen && hasGitSource },
    );

  return (
    <div className="flex flex-row gap-4 w-full flex-wrap ">
      <TooltipProvider delayDuration={0} disableHoverableContent={false}>
        {canDeploy && (
          <DialogAction
            title="Deploy Compose"
            description={
              <div className="space-y-2">
                <p>Are you sure you want to deploy this compose?</p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Optional: Deploy a specific commit hash (7-40 hex
                    characters)
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={commitHash}
                      onChange={(e) => {
                        setCommitHash(e.target.value);
                      }}
                      placeholder="e.g. a1b2c3d4"
                    />
                    {hasGitSource && (
                      <Popover
                        open={gitHistoryOpen}
                        onOpenChange={setGitHistoryOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            type="button"
                            title="View git history"
                          >
                            <History className="size-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-96 p-2"
                          align="end"
                          side="bottom"
                        >
                          <p className="text-xs font-medium mb-2 px-1">
                            Recent commits
                          </p>
                          {isFetchingGitHistory ? (
                            <p className="text-xs text-muted-foreground px-1 py-2">
                              Loading commits...
                            </p>
                          ) : !gitHistory || gitHistory.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-1 py-2">
                              No commits found. Deploy at least once to see git
                              history.
                            </p>
                          ) : (
                            <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                              {gitHistory.map((commit) => (
                                <button
                                  key={commit.hash}
                                  type="button"
                                  className="flex flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-muted cursor-pointer"
                                  onClick={() => {
                                    setCommitHash(commit.hash);
                                    setGitHistoryOpen(false);
                                  }}
                                >
                                  <span className="text-xs font-mono text-primary">
                                    {commit.hash.slice(0, 12)}
                                  </span>
                                  <span className="text-xs truncate">
                                    {commit.message}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {commit.author} &middot;{" "}
                                    {new Date(
                                      commit.date,
                                    ).toLocaleDateString()}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  {commitHash.trim().length > 0 && (
                    <div className="space-y-1">
                      {!hasValidCommitHash ? (
                        <p className="text-xs text-muted-foreground">
                          Enter a valid commit hash to fetch branch information.
                        </p>
                      ) : isLoadingBranchInfo ? (
                        <p className="text-xs text-muted-foreground">
                          Fetching branch information...
                        </p>
                      ) : matchingBranches.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-xs text-muted-foreground">
                            Branches:
                          </span>
                          {matchingBranches.map((branch) => (
                            <Badge
                              key={branch}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {branch}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {configuredBranch
                            ? `No branch head matched this commit. Configured branch: ${configuredBranch}`
                            : "No branch information found for this commit."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            }
            type="default"
            onClick={async () => {
              const normalizedCommitHash = commitHash.trim();
              if (
                normalizedCommitHash &&
                !/^[a-fA-F0-9]{7,40}$/.test(normalizedCommitHash)
              ) {
                toast.error(
                  "Invalid commit hash. Use 7-40 hexadecimal characters.",
                );
                return;
              }
              await deploy({
                composeId: composeId,
                ...(normalizedCommitHash && {
                  commitHash: normalizedCommitHash,
                }),
              })
                .then(() => {
                  toast.success("Compose deployed successfully");
                  setCommitHash("");
                  refetch();
                  router.push(
                    `/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/compose/${composeId}?tab=deployments`,
                  );
                })
                .catch(() => {
                  toast.error("Error deploying compose");
                });
            }}
          >
            <Button
              variant="default"
              isLoading={data?.composeStatus === "running"}
              className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <Rocket className="size-4 mr-1" />
                    Deploy
                  </div>
                </TooltipTrigger>
                <TooltipPrimitive.Portal>
                  <TooltipContent sideOffset={5} className="z-[60]">
                    <p>
                      Downloads the source code and performs a complete build
                    </p>
                  </TooltipContent>
                </TooltipPrimitive.Portal>
              </Tooltip>
            </Button>
          </DialogAction>
        )}
        {canDeploy && (
          <DialogAction
            title="Reload Compose"
            description="Are you sure you want to reload this compose?"
            type="default"
            onClick={async () => {
              const normalizedCommitHash = commitHash.trim();
              if (
                normalizedCommitHash &&
                !/^[a-fA-F0-9]{7,40}$/.test(normalizedCommitHash)
              ) {
                toast.error(
                  "Invalid commit hash. Use 7-40 hexadecimal characters.",
                );
                return;
              }
              await redeploy({
                composeId: composeId,
                ...(normalizedCommitHash && {
                  commitHash: normalizedCommitHash,
                }),
              })
                .then(() => {
                  toast.success("Compose reloaded successfully");
                  setCommitHash("");
                  refetch();
                })
                .catch(() => {
                  toast.error("Error reloading compose");
                });
            }}
          >
            <Button
              variant="secondary"
              isLoading={data?.composeStatus === "running"}
              className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <RefreshCcw className="size-4 mr-1" />
                    Reload
                  </div>
                </TooltipTrigger>
                <TooltipPrimitive.Portal>
                  <TooltipContent sideOffset={5} className="z-[60]">
                    <p>Reload the compose without rebuilding it</p>
                  </TooltipContent>
                </TooltipPrimitive.Portal>
              </Tooltip>
            </Button>
          </DialogAction>
        )}
        {canDeploy &&
          (data?.composeType === "docker-compose" &&
          data?.composeStatus === "idle" ? (
            <DialogAction
              title="Start Compose"
              description="Are you sure you want to start this compose?"
              type="default"
              onClick={async () => {
                await start({
                  composeId: composeId,
                })
                  .then(() => {
                    toast.success("Compose started successfully");
                    refetch();
                  })
                  .catch(() => {
                    toast.error("Error starting compose");
                  });
              }}
            >
              <Button
                variant="secondary"
                isLoading={isStarting}
                className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <CheckCircle2 className="size-4 mr-1" />
                      Start
                    </div>
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent sideOffset={5} className="z-[60]">
                      <p>
                        Start the compose (requires a previous successful build)
                      </p>
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              </Button>
            </DialogAction>
          ) : (
            <DialogAction
              title="Stop Compose"
              description="Are you sure you want to stop this compose?"
              onClick={async () => {
                await stop({
                  composeId: composeId,
                })
                  .then(() => {
                    toast.success("Compose stopped successfully");
                    refetch();
                  })
                  .catch(() => {
                    toast.error("Error stopping compose");
                  });
              }}
            >
              <Button
                variant="destructive"
                isLoading={isStopping}
                className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Ban className="size-4 mr-1" />
                      Stop
                    </div>
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent sideOffset={5} className="z-[60]">
                      <p>Stop the currently running compose</p>
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              </Button>
            </DialogAction>
          ))}
      </TooltipProvider>
      <DockerTerminalModal
        appName={data?.appName || ""}
        serverId={data?.serverId || ""}
        appType={data?.composeType || "docker-compose"}
      >
        <Button
          variant="outline"
          className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <Terminal className="size-4 mr-1" />
          Open Terminal
        </Button>
      </DockerTerminalModal>
      {canUpdateService && (
        <div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
          <span className="text-sm font-medium">Autodeploy</span>
          <Switch
            aria-label="Toggle autodeploy"
            checked={data?.autoDeploy || false}
            onCheckedChange={async (enabled) => {
              await update({
                composeId,
                autoDeploy: enabled,
              })
                .then(async () => {
                  toast.success("Auto Deploy Updated");
                  await refetch();
                })
                .catch(() => {
                  toast.error("Error updating Auto Deploy");
                });
            }}
            className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
          />
        </div>
      )}
    </div>
  );
};
