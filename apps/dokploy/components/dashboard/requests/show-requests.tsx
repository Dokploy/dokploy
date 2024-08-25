import { api, type RouterOutputs } from "@/utils/api";
import * as React from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RequestDistributionChart } from "./request-distribution-chart";
import { RequestsTable } from "./requests-table";

export type LogEntry = NonNullable<
	RouterOutputs["settings"]["readStatsLogs"]["data"]
>[0];

export const ShowRequests = () => {
	const { data: isLogRotateActive, refetch: refetchLogRotate } =
		api.settings.getLogRotateStatus.useQuery();

	const { mutateAsync } = api.settings.activateLogRotate.useMutation();
	const { mutateAsync: deactivateLogRotate } =
		api.settings.deactivateLogRotate.useMutation();

	return (
		<>
			<Card className="bg-transparent mt-10">
				<CardHeader>
					<CardTitle>Request Distribution</CardTitle>
					<div className="flex justify-between gap-2">
						<CardDescription>
							<span>Showing web and API requests over time</span>
						</CardDescription>
						{!isLogRotateActive && (
							<Button
								onClick={() => {
									mutateAsync()
										.then(() => {
											toast.success("Log rotate activated");
											refetchLogRotate();
										})
										.catch((err) => {
											toast.error(err.message);
										});
								}}
							>
								Activate Log Rotate
							</Button>
						)}

						{isLogRotateActive && (
							<Button
								onClick={() => {
									deactivateLogRotate()
										.then(() => {
											toast.success("Log rotate deactivated");
											refetchLogRotate();
										})
										.catch((err) => {
											toast.error(err.message);
										});
								}}
							>
								Deactivate Log Rotate
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					<RequestDistributionChart />
				</CardContent>
			</Card>
			<RequestsTable />
		</>
	);
};
