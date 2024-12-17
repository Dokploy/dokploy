import React from "react";
import { SwarmList, columns } from "./columns";
import { DataTable } from "./data-table";
import { api } from "@/utils/api";

function ShowSwarmNodes() {
  const { data, isLoading } = api.swarm.getNodes.useQuery();

  console.log(data);

  return (
    <DataTable columns={columns} data={data ?? []} isLoading={isLoading} />
  );
}

export default ShowSwarmNodes;
