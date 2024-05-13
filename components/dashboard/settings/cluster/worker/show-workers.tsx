import React from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

import { api } from "@/utils/api";
import { AddWorker } from "./add-worker";
import { DateTooltip } from "@/components/shared/date-tooltip";

export const ShowCluster = () => {
	const { data, isLoading } = api.cluster.getWorkers.useQuery();
	// console.log(data)
	return (
		<Card className="bg-transparent h-full">
			<CardHeader className="flex flex-row gap-2 justify-between w-full items-center flex-wrap">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Cluster</CardTitle>
					<CardDescription>Add nodes to your cluster</CardDescription>
				</div>
				<AddWorker />
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid md:grid-cols-1 gap-4">
					{isLoading && <div>Loading...</div>}
					{data?.map((worker, index) => (
						<div
							key={`key-${index}`}
							className="flex flex-row gap-4 w-full flex-wrap"
						>
							<span className="text-sm text-muted-foreground">
								{worker.Description.Hostname}
							</span>
							<span className="text-sm text-muted-foreground">
								{worker.Status.State}
							</span>
							<span className="text-sm text-muted-foreground">
								{worker.Spec.Availability}
							</span>
							<span className="text-sm text-muted-foreground">
								{worker?.ManagerStatus?.Reachability || "-"}
							</span>
							<span className="text-sm text-muted-foreground">
								{worker?.Spec?.Role}
							</span>

							<span className="text-sm text-muted-foreground">
								{worker?.Description.Engine.EngineVersion}
							</span>
							<DateTooltip date={worker.CreatedAt} className="text-sm">
								{/* <span className="text-sm text-muted-foreground">Created</span> */}
							</DateTooltip>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
};
