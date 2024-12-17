import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DataTable } from "./data-table";
import { columns } from "./columns";
import { LoaderIcon } from "lucide-react";

interface Props {
  nodeName: string;
}

interface ApplicationList {
  ID: string;
  Image: string;
  Mode: string;
  Name: string;
  Ports: string;
  Replicas: string;
  CurrentState: string;
  DesiredState: string;
  Error: string;
  Node: string;
}

const ShowNodeApplications = ({ nodeName }: Props) => {
  const [loading, setLoading] = React.useState(true);
  const { data: NodeApps, isLoading: NodeAppsLoading } =
    api.swarm.getNodeApps.useQuery();

  let applicationList = "";

  if (NodeApps && NodeApps.length > 0) {
    applicationList = NodeApps.map((app) => app.Name).join(" ");
  }

  const { data: NodeAppDetails, isLoading: NodeAppDetailsLoading } =
    api.swarm.getAppInfos.useQuery({ appName: applicationList });

  if (NodeAppsLoading || NodeAppDetailsLoading) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <DropdownMenuItem
            className="w-full cursor-pointer"
            disabled
            onSelect={(e) => e.preventDefault()}
          >
            <LoaderIcon className="animate-spin h-5 w-5" />
          </DropdownMenuItem>
        </DialogTrigger>
      </Dialog>
    );
  }

  if (!NodeApps || !NodeAppDetails) {
    return <div>No data found</div>;
  }

  const combinedData: ApplicationList[] = NodeApps.flatMap((app) => {
    const appDetails =
      NodeAppDetails?.filter((detail) =>
        detail.Name.startsWith(`${app.Name}.`)
      ) || [];

    if (appDetails.length === 0) {
      return [
        {
          ...app,
          CurrentState: "N/A",
          DesiredState: "N/A",
          Error: "",
          Node: "N/A",
          Ports: app.Ports,
        },
      ];
    }

    return appDetails.map((detail) => ({
      ...app,
      CurrentState: detail.CurrentState,
      DesiredState: detail.DesiredState,
      Error: detail.Error,
      Node: detail.Node,
      Ports: detail.Ports || app.Ports,
    }));
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <DropdownMenuItem
          className="w-full cursor-pointer"
          onSelect={(e) => e.preventDefault()}
        >
          Show Applications
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className={"sm:max-w-5xl overflow-y-auto max-h-screen"}>
        <DialogHeader>
          <DialogTitle>Node Applications</DialogTitle>
          <DialogDescription>
            See in detail the applications running on this node
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[90vh]">
          <DataTable columns={columns} data={combinedData ?? []} />
        </div>
        {/* <div className="text-wrap rounded-lg border p-4 text-sm sm:max-w-[59rem] bg-card max-h-[70vh] overflow-auto"></div> */}
      </DialogContent>
    </Dialog>
  );
};

export default ShowNodeApplications;
