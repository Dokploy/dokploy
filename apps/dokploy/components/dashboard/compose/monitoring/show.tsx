import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useEffect, useState } from "react";
import { DockerMonitoring } from "../../monitoring/docker/show";
import { toast } from "sonner";

interface Props {
  appName: string;
  appType: "stack" | "docker-compose";
}

export const ShowMonitoringCompose = ({
  appName,
  appType = "stack",
}: Props) => {
  const { data } = api.docker.getContainersByAppNameMatch.useQuery(
    {
      appName: appName,
      appType,
    },
    {
      enabled: !!appName,
    },
  );

  const [containerAppName, setContainerAppName] = useState<
    string | undefined
  >();

  const [containerId, setContainerId] = useState<string | undefined>();

  const { mutateAsync: restart, isLoading } =
    api.docker.restartContainer.useMutation();

  useEffect(() => {
    if (data && data?.length > 0) {
      setContainerAppName(data[0]?.name);
      setContainerId(data[0]?.containerId);
    }
  }, [data]);

  return (
    <div>
      <Card className="bg-background">
        <CardHeader>
          <CardTitle className="text-xl">Monitoring</CardTitle>
          <CardDescription>Watch the usage of your compose</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Label>Select a container to watch the monitoring</Label>
          <div className="flex flex-row gap-4">
            <Select
              onValueChange={(value) => {
                setContainerAppName(value);
                setContainerId(
                  data?.find((container) => container.name === value)
                    ?.containerId,
                );
              }}
              value={containerAppName}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a container" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {data?.map((container) => (
                    <SelectItem
                      key={container.containerId}
                      value={container.name}
                    >
                      {container.name} ({container.containerId}){" "}
                      {container.state}
                    </SelectItem>
                  ))}
                  <SelectLabel>Containers ({data?.length})</SelectLabel>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              isLoading={isLoading}
              onClick={async () => {
                if (!containerId) return;
                toast.success(`Restarting container ${containerAppName}`);
                await restart({ containerId }).then(() => {
                  toast.success("Container restarted");
                });
              }}
            >
              Restart
            </Button>
          </div>
          <DockerMonitoring
            appName={containerAppName || ""}
            appType={appType}
          />
        </CardContent>
      </Card>
    </div>
  );
};
