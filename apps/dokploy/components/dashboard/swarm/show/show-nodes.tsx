import { api } from "@/utils/api";
import React from "react";
import { columns } from "./columns";
import { DataTable } from "./data-table";

function ShowSwarmNodes() {
	const { data, isLoading } = api.swarm.getNodes.useQuery();

	return (
		<DataTable columns={columns} data={data ?? []} isLoading={isLoading} />
	);
}

export default ShowSwarmNodes;
