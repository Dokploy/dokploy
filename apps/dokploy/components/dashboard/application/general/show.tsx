import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  Ban,
  CheckCircle2,
  Hammer,
  History,
  RefreshCcw,
  Rocket,
  Terminal,
} from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { ShowBuildChooseForm } from "@/components/dashboard/application/build/show";
import { ShowProviderForm } from "@/components/dashboard/application/general/generic/show";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  applicationId: string;
}

export const ShowGeneralApplication = ({ applicationId }: Props) => {
  const router = useRouter();
  const { data: permissions } = api.user.getPermissions.useQuery();
  const canDeploy = permissions?.deployment.create ?? false;
  const canUpdateService = permissions?.service.create ?? false;
  const { data, refetch } = api.application.one.useQuery(
    {
      applicationId,
    },
    { enabled: !!applicationId },
  );
  const { mutateAsync: update } = api.application.update.useMutation();
  const { mutateAsync: start, isPending: isStarting } =
    api.application.start.useMutation();
  const { mutateAsync: stop, isPending: isStopping } =
    api.application.stop.useMutation();

  const { mutateAsync: deploy } = api.application.deploy.useMutation();

  const { mutateAsync: reload, isPending: isReloading } =
    api.application.reload.useMutation();

  const { mutateAsync: redeploy } = api.application.redeploy.useMutation();
  const [commitHash, setCommitHash] = useState("");
  const [gitHistoryOpen, setGitHistoryOpen] = useState(false);
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

  const { data: gitHistory, isFetching: isFetchingGitHistory } =
    api.application.getGitHistory.useQuery(
      { applicationId, limit: 10 },
      { enabled: gitHistoryOpen && hasGitSource },
    );

  return (
    <>
      <Card className="bg-background">
        <CardHeader>
          <CardTitle className="text-xl">Deploy Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-row gap-4 flex-wrap">
          <TooltipProvider delayDuration={0} disableHoverableContent={false}>
            {canDeploy && (
              <DialogAction
                title="Deploy Application"
                description={
                  <div className="space-y-2">
                    <p>Are you sure you want to deploy this application?</p>
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
                                  No commits found. Deploy at least once to see
                                  git history.
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
                        <div className="space-y-2">
                          {!hasValidCommitHash ? (
                            <p className="text-xs text-muted-foreground">
                              Enter a valid commit hash to fetch branch
                              information.
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
                    applicationId: applicationId,
                    ...(normalizedCommitHash && {
                      commitHash: normalizedCommitHash,
                    }),
                  })
                    .then(() => {
                      toast.success("Application deployed successfully");
                      setCommitHash("");
                      refetch();
                      router.push(
                        `/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/application/${applicationId}?tab=deployments`,
                      );
                    })
                    .catch(() => {
                      toast.error("Error deploying application");
                    });
                }}
              >
                <Button
                  variant="default"
                  isLoading={data?.applicationStatus === "running"}
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
                          Downloads the source code and performs a complete
                          build
                        </p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </Button>
              </DialogAction>
            )}
            {canDeploy && (
              <DialogAction
                title="Reload Application"
                description="Are you sure you want to reload this application?"
                type="default"
                onClick={async () => {
                  await reload({
                    applicationId: applicationId,
                    appName: data?.appName || "",
                  })
                    .then(() => {
                      toast.success("Application reloaded successfully");
                      refetch();
                    })
                    .catch(() => {
                      toast.error("Error reloading application");
                    });
                }}
              >
                <Button
                  variant="secondary"
                  isLoading={isReloading}
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
                        <p>Reload the application without rebuilding it</p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </Button>
              </DialogAction>
            )}
            {canDeploy && (
              <DialogAction
                title="Rebuild Application"
                description="Are you sure you want to rebuild this application?"
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
                    applicationId: applicationId,
                    ...(normalizedCommitHash && {
                      commitHash: normalizedCommitHash,
                    }),
                  })
                    .then(() => {
                      toast.success("Application rebuilt successfully");
                      setCommitHash("");
                      refetch();
                    })
                    .catch(() => {
                      toast.error("Error rebuilding application");
                    });
                }}
              >
                <Button
                  variant="secondary"
                  isLoading={data?.applicationStatus === "running"}
                  className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        <Hammer className="size-4 mr-1" />
                        Rebuild
                      </div>
                    </TooltipTrigger>
                    <TooltipPrimitive.Portal>
                      <TooltipContent sideOffset={5} className="z-[60]">
                        <p>
                          Only rebuilds the application without downloading new
                          code
                        </p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </Button>
              </DialogAction>
            )}

            {canDeploy && data?.applicationStatus === "idle" ? (
              <DialogAction
                title="Start Application"
                description="Are you sure you want to start this application?"
                type="default"
                onClick={async () => {
                  await start({
                    applicationId: applicationId,
                  })
                    .then(() => {
                      toast.success("Application started successfully");
                      refetch();
                    })
                    .catch(() => {
                      toast.error("Error starting application");
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
                          Start the application (requires a previous successful
                          build)
                        </p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </Button>
              </DialogAction>
            ) : canDeploy ? (
              <DialogAction
                title="Stop Application"
                description="Are you sure you want to stop this application?"
                onClick={async () => {
                  await stop({
                    applicationId: applicationId,
                  })
                    .then(() => {
                      toast.success("Application stopped successfully");
                      refetch();
                    })
                    .catch(() => {
                      toast.error("Error stopping application");
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
                        <p>Stop the currently running application</p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </Button>
              </DialogAction>
            ) : null}
          </TooltipProvider>
          <DockerTerminalModal
            appName={data?.appName || ""}
            serverId={data?.serverId || ""}
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
                    applicationId,
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

          {canUpdateService && (
            <div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
              <span className="text-sm font-medium">Clean Cache</span>
              <Switch
                aria-label="Toggle clean cache"
                checked={data?.cleanCache || false}
                onCheckedChange={async (enabled) => {
                  await update({
                    applicationId,
                    cleanCache: enabled,
                  })
                    .then(async () => {
                      toast.success("Clean Cache Updated");
                      await refetch();
                    })
                    .catch(() => {
                      toast.error("Error updating Clean Cache");
                    });
                }}
                className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
              />
            </div>
          )}
        </CardContent>
      </Card>
      <ShowProviderForm applicationId={applicationId} />
      <ShowBuildChooseForm applicationId={applicationId} />
    </>
  );
};
