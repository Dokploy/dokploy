import { DialogAction } from "@/components/shared/dialog-action";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type LogLine, parseLogs } from "../../docker/logs/utils";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

interface Props {
  mariadbId: string;
}

export const ShowGeneralMariadb = ({ mariadbId }: Props) => {
  const { data, refetch } = api.mariadb.one.useQuery(
    {
      mariadbId,
    },
    { enabled: !!mariadbId }
  );

  const { mutateAsync: reload, isLoading: isReloading } =
    api.mariadb.reload.useMutation();

  const { mutateAsync: start, isLoading: isStarting } =
    api.mariadb.start.useMutation();

  const { mutateAsync: stop, isLoading: isStopping } =
    api.mariadb.stop.useMutation();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  api.mariadb.deployWithLogs.useSubscription(
    {
      mariadbId: mariadbId,
    },
    {
      enabled: isDeploying,
      onData(log) {
        if (!isDrawerOpen) {
          setIsDrawerOpen(true);
        }

        if (log === "Deployment completed successfully!") {
          setIsDeploying(false);
        }
        const parsedLogs = parseLogs(log);
        setFilteredLogs((prev) => [...prev, ...parsedLogs]);
      },
      onError(error) {
        console.error("Deployment logs error:", error);
        setIsDeploying(false);
      },
    }
  );

  return (
    <>
      <div className="flex w-full flex-col gap-5 ">
        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="text-xl">Deploy Settings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-row gap-4 flex-wrap">
            <TooltipProvider delayDuration={0}>
              <DialogAction
                title="Deploy Mariadb"
                description="Are you sure you want to deploy this mariadb?"
                type="default"
                onClick={async () => {
                  setIsDeploying(true);
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  refetch();
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      isLoading={data?.applicationStatus === "running"}
                      className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
                    >
                      <Rocket className="size-4 mr-1" />
                      Deploy
                    </Button>
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent sideOffset={5} className="z-[60]">
                      <p>Downloads and sets up the MariaDB database</p>
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              </DialogAction>
              <DialogAction
                title="Reload Mariadb"
                description="Are you sure you want to reload this mariadb?"
                type="default"
                onClick={async () => {
                  await reload({
                    mariadbId: mariadbId,
                    appName: data?.appName || "",
                  })
                    .then(() => {
                      toast.success("Mariadb reloaded successfully");
                      refetch();
                    })
                    .catch(() => {
                      toast.error("Error reloading Mariadb");
                    });
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      isLoading={isReloading}
                      className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
                    >
                      <RefreshCcw className="size-4 mr-1" />
                      Reload
                    </Button>
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent sideOffset={5} className="z-[60]">
                      <p>Restart the MariaDB service without rebuilding</p>
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              </DialogAction>
              {data?.applicationStatus === "idle" ? (
                <DialogAction
                  title="Start Mariadb"
                  description="Are you sure you want to start this mariadb?"
                  type="default"
                  onClick={async () => {
                    await start({
                      mariadbId: mariadbId,
                    })
                      .then(() => {
                        toast.success("Mariadb started successfully");
                        refetch();
                      })
                      .catch(() => {
                        toast.error("Error starting Mariadb");
                      });
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        isLoading={isStarting}
                        className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
                      >
                        <CheckCircle2 className="size-4 mr-1" />
                        Start
                      </Button>
                    </TooltipTrigger>
                    <TooltipPrimitive.Portal>
                      <TooltipContent sideOffset={5} className="z-[60]">
                        <p>
                          Start the MariaDB database (requires a previous
                          successful setup)
                        </p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </DialogAction>
              ) : (
                <DialogAction
                  title="Stop Mariadb"
                  description="Are you sure you want to stop this mariadb?"
                  onClick={async () => {
                    await stop({
                      mariadbId: mariadbId,
                    })
                      .then(() => {
                        toast.success("Mariadb stopped successfully");
                        refetch();
                      })
                      .catch(() => {
                        toast.error("Error stopping Mariadb");
                      });
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        isLoading={isStopping}
                        className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
                      >
                        <Ban className="size-4 mr-1" />
                        Stop
                      </Button>
                    </TooltipTrigger>
                    <TooltipPrimitive.Portal>
                      <TooltipContent sideOffset={5} className="z-[60]">
                        <p>Stop the currently running MariaDB database</p>
                      </TooltipContent>
                    </TooltipPrimitive.Portal>
                  </Tooltip>
                </DialogAction>
              )}
            </TooltipProvider>
            <DockerTerminalModal
              appName={data?.appName || ""}
              serverId={data?.serverId || ""}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    <Terminal className="size-4" />
                    Open Terminal
                  </Button>
                </TooltipTrigger>
                <TooltipPrimitive.Portal>
                  <TooltipContent sideOffset={5} className="z-[60]">
                    <p>Open a terminal to the MariaDB container</p>
                  </TooltipContent>
                </TooltipPrimitive.Portal>
              </Tooltip>
            </DockerTerminalModal>
          </CardContent>
        </Card>
        <DrawerLogs
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setFilteredLogs([]);
            setIsDeploying(false);
            refetch();
          }}
          filteredLogs={filteredLogs}
        />
      </div>
    </>
  );
};
