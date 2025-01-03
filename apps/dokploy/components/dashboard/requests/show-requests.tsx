import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { type RouterOutputs, api } from "@/utils/api";
import * as React from "react";
import { toast } from "sonner";
import { RequestDistributionChart } from "./request-distribution-chart";
import { RequestsTable } from "./requests-table";

export type LogEntry = NonNullable<
	RouterOutputs["settings"]["readStatsLogs"]["data"]
>[0];

export const ShowRequests = () => {
	const { data: isLogRotateActive, refetch: refetchLogRotate } =
		api.settings.getLogRotateStatus.useQuery();

	const { mutateAsync: toggleLogRotate } =
		api.settings.toggleLogRotate.useMutation();

	const { data: isActive, refetch } =
		api.settings.haveActivateRequests.useQuery();
	const { mutateAsync: toggleRequests } =
		api.settings.toggleRequests.useMutation();

	return (
		<>
			<Card className="bg-transparent mt-10">
				<CardHeader>
					<CardTitle>Request Distribution</CardTitle>
					<div className="flex  max-sm:flex-wrap justify-between gap-2">
						<CardDescription>
							<span>Showing web and API requests over time</span>
						</CardDescription>
						<div className="flex w-fit gap-4">
							<DialogAction
								title={isActive ? "Deactivate Requests" : "Activate Requests"}
								description="You will also need to restart Traefik to apply the changes"
								onClick={async () => {
									await toggleRequests({ enable: !isActive })
										.then(() => {
											refetch();
											toast.success(
												`Requests ${isActive ? "deactivated" : "activated"}`,
											);
										})
										.catch((err) => {
											toast.error(err.message);
										});
								}}
							>
								<Button>{isActive ? "Deactivate" : "Activate"}</Button>
							</DialogAction>

							<DialogAction
								title={
									isLogRotateActive
										? "Activate Log Rotate"
										: "Deactivate Log Rotate"
								}
								description={
									isLogRotateActive
										? "This will make the logs rotate on interval 1 day and maximum size of 100 MB and maximum 6 logs"
										: "The log rotation will be disabled"
								}
								onClick={() => {
									toggleLogRotate({
										enable: !isLogRotateActive,
									})
										.then(() => {
											toast.success(
												`Log rotate ${isLogRotateActive ? "activated" : "deactivated"}`,
											);
											refetchLogRotate();
										})
										.catch((err) => {
											toast.error(err.message);
										});
								}}
							>
								<Button variant="secondary">
									{isLogRotateActive
										? "Activate Log Rotate"
										: "Deactivate Log Rotate"}
								</Button>
							</DialogAction>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{isActive ? (
						<RequestDistributionChart />
					) : (
						<div className="flex items-center justify-center min-h-[25vh]">
							<span className="text-muted-foreground py-6">
								You need to activate requests
							</span>
						</div>
					)}
				</CardContent>
			</Card>
			{isActive && <RequestsTable />}
		</>
	);
};
