import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { badgeStateColor } from "@/components/dashboard/application/logs/show";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { ContainerFreeMonitoring } from "./show-free-container-monitoring";

interface Props {
  serviceId?: string;
  composeId: string;
  appName: string;
  serverId?: string;
  appType: "stack" | "docker-compose";
}

// Keep the picker and its task/legacy rendering together; JSX branches account for the complexity.
// oxlint-disable-next-line complexity, max-lines-per-function
export const ComposeFreeMonitoring = ({
  serviceId,
  composeId,
  appName,
  appType = "stack",
  serverId,
}: Props) => {
  const isStack = appType === "stack";
  const { data: legacyContainers, isPending: legacyPending } =
    api.docker.getContainersByAppNameMatch.useQuery(
      {
        appName: appName,
        appType,
        serverId,
      },
      {
        enabled: !!appName && !isStack,
      },
    );

  const {
    data: tasks,
    isPending: tasksPending,
    error: tasksError,
  } = api.docker.getComposeTasks.useQuery(
    { composeId },
    { enabled: isStack && !!composeId, refetchInterval: 5000 },
  );
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const { mutateAsync: restart, isPending: legacyRestarting } =
    api.docker.restartContainer.useMutation();
  const { mutateAsync: restartTask, isPending: taskRestarting } =
    api.docker.restartComposeTask.useMutation();
  const data = isStack
    ? tasks?.map((task) => ({
        ...task,
        selectionId: task.taskId,
        label: `${task.serviceName} · ${task.nodeName} · ${task.taskId}`,
      }))
    : legacyContainers?.map((container) => ({
        ...container,
        selectionId: container.name,
        label: container.name,
      }));
  const selected = data?.find((container) => container.selectionId === selectedId);
  const containerAppName = selected?.name;
  const containerId = selected?.containerId;
  const isPending = isStack ? tasksPending : legacyPending;
  const isRestarting = isStack ? taskRestarting : legacyRestarting;

  useEffect(() => {
    setSelectedId(undefined);
  }, [composeId, appType]);

  useEffect(() => {
    if (isStack) {
      setSelectedId((previous) => {
        if (previous === undefined) return tasks?.[0]?.taskId;

        return tasks?.some((task) => task.taskId === previous) ? previous : "";
      });
    } else if (legacyContainers?.length) {
      setSelectedId(legacyContainers[0]?.name);
    }
  }, [tasks, legacyContainers, isStack]);

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">Monitoring</CardTitle>
        <CardDescription>Watch the usage of your compose</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Label>Select a container to watch the monitoring</Label>
        <div className="flex flex-row gap-4">
          <Select onValueChange={setSelectedId} value={selectedId ?? ""}>
            <SelectTrigger>
              {isPending ? (
                <div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground">
                  <span>Loading...</span>
                  <Loader2 className="animate-spin size-4" />
                </div>
              ) : (
                <SelectValue placeholder="Select a container" />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {data?.map((container) => (
                  <SelectItem key={container.selectionId} value={container.selectionId}>
                    {container.label} (
                    {isStack ? container.containerId.slice(0, 12) : container.containerId}){" "}
                    <Badge variant={badgeStateColor(container.state)}>{container.state}</Badge>
                  </SelectItem>
                ))}
                <SelectLabel>Containers ({data?.length})</SelectLabel>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            isLoading={isRestarting}
            disabled={!selected || (isStack && !!tasksError) || isRestarting}
            onClick={async () => {
              if (!containerId || !selectedId) return;

              try {
                if (isStack) {
                  await restartTask({ composeId, taskId: selectedId });
                } else {
                  await restart({ containerId });
                }

                toast.success(isStack ? "Task restart requested" : "Container restarted");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to restart container");
              }
            }}
          >
            Restart
          </Button>
        </div>
        {isStack && tasksError && <p role="alert">Tasks unavailable: {tasksError.message}</p>}
        {isStack && !isPending && !tasksError && !tasks?.length && <p>No running tasks.</p>}
        {isStack && selectedId === "" && !!tasks?.length && (
          <p>The selected task is no longer running. Select a task to continue.</p>
        )}
        <ContainerFreeMonitoring
          serviceId={serviceId}
          composeId={isStack ? composeId : undefined}
          taskId={isStack ? selected?.selectionId : undefined}
          appName={containerAppName || ""}
          appType={appType}
        />
      </CardContent>
    </>
  );
};
