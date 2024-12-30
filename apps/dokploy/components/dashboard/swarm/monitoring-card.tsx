import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import {
  Activity,
  Loader2,
  Monitor,
  Settings,
  Server,
} from "lucide-react";
import { NodeCard } from "./details/details-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface Props {
  serverId?: string;
}

export default function SwarmMonitorCard({ serverId }: Props) {
  const { data: nodes, isLoading } = api.swarm.getNodes.useQuery({
    serverId,
  });

	if (isLoading) {
		return (
    <div className="min-h-screen">
			<div className="w-full max-w-7xl mx-auto space-y-6 py-4">
				<div className="space-y-4">
					<Skeleton className="h-8 w-1/3" />
					<Skeleton className="h-5 w-2/5" />
				</div>

				<div className="grid gap-6 md:grid-cols-3">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="p-4 border rounded-md">
							<div className="flex flex-row items-center justify-between mb-4">
								<Skeleton className="h-4 w-1/4" />
								<Skeleton className="h-8 w-8 rounded-md" />
							</div>
							<Skeleton className="h-6 w-1/2" />
						</div>
					))}
				</div>

        <Card className="w-full bg-background">
      <CardHeader>
        <CardTitle className="text-lg">
          <Skeleton className="h-6 w-32" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between">
            <div className="flex items-center space-x-4 p-2 rounded-xl border">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="flex flex-wrap items-center space-x-4">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 flex flex-col items-center text-center">
                <div className="flex items-center text-sm">
                  <Skeleton className="mr-2 h-4 w-4" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>

          <div className="flex justify-end w-full space-x-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </CardContent>
    </Card>
			</div>
		</div>
		);
	}

	if (!nodes) {
		return (
			<div className="w-full max-w-7xl mx-auto">
				<div className="mb-6 border min-h-[55vh] rounded-lg h-full">
					<div className="flex items-center justify-center h-full  text-destructive">
						<span>Failed to load data</span>
					</div>
				</div>
			</div>
		);
	}

  const totalNodes = nodes.length;
  const activeNodesCount = nodes.filter((node) => node.Status === "Ready").length;
  const managerNodesCount = nodes.filter((node) =>node.ManagerStatus === "Leader" || node.ManagerStatus === "Reachable").length;
  const activeNodes = nodes.filter((node) => node.Status === "Ready");
  const managerNodes = nodes.filter((node) => node.ManagerStatus === "Leader" || node.ManagerStatus === "Reachable");

  return (
    <div className="min-h-screen">
      <div className="w-full max-w-7xl mx-auto space-y-6 py-4">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Docker Swarm Overview</h1>
            <p className="text-sm text-muted-foreground">Monitor and manage your Docker Swarm cluster</p>
          </div>
          {!serverId && (
            <Button onClick={() => window.location.replace("/dashboard/settings/cluster")}>
              <Settings className="mr-2 h-4 w-4" />
              Manage Cluster
            </Button>
          )}
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Nodes</CardTitle>
              <div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
                <Server className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalNodes}</div>
            </CardContent>
          </Card>

          <Card className="bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Nodes
                <Badge variant="green">
                  Online
                </Badge>
              </CardTitle>
              <div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
                <Activity className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="text-2xl font-bold">
                      {activeNodesCount} / {totalNodes}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-h-48 overflow-y-auto">
                      {activeNodes.map((node) => (
                        <div key={node.ID} className="flex items-center gap-2">
                          {node.Hostname}
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardContent>
          </Card>

          <Card className="bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Manager Nodes
                <Badge variant="green">
                  Online
                </Badge>
              </CardTitle>
              <div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
                <Monitor className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="text-2xl font-bold">
                      {managerNodesCount} / {totalNodes}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-h-48 overflow-y-auto">
                      {managerNodes.map((node) => (
                        <div key={node.ID} className="flex items-center gap-2">
                          {node.Hostname}
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-row gap-4">
          {nodes.map((node) => (
            <NodeCard key={node.ID} node={node} serverId={serverId} />
          ))}
        </div>
      </div>
    </div>
  );
}