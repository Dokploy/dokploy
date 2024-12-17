import { api } from "@/utils/api";
import React from "react";
import { columns } from "./columns";
import { DataTable } from "./data-table";

function ShowApplicationServers() {
	const { data, isLoading } = api.server.all.useQuery();

	console.log(data);

	return (
		<DataTable columns={columns} data={data ?? []} isLoading={isLoading} />
	);
}

export default ShowApplicationServers;
