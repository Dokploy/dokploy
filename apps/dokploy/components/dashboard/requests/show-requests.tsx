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

	const { mutateAsync } = api.settings.activateLogRotate.useMutation();
	const { mutateAsync: deactivateLogRotate } =
		api.settings.deactivateLogRotate.useMutation();

	const { data: isActive, refetch } =
		api.settings.haveActivateRequests.useQuery();
	const { mutateAsync: toggleRequests } =
		api.settings.toggleRequests.useMutation();

	return (
		<>
			<Card className="bg-transparent mt-10">
				<CardHeader>
					<CardTitle>Request Distribution</CardTitle>
					<div className="flex justify-between gap-2">
						<CardDescription>
							<span>Showing web and API requests over time</span>
						</CardDescription>
						<div className="flex w-fit gap-4">
							<Button
								onClick={() => {
									mutateAsync()
										.then(async () => {
											await toggleRequests({ enable: !isActive })
												.then(() => {
													refetch();
													toast.success("Access Log Added to Traefik");
												})
												.catch((err) => {
													toast.error(err.message);
												});
										})
										.catch((err) => {
											toast.error(err.message);
										});
								}}
							>
								{isActive ? "Deactivate" : "Activate"}
							</Button>
							{!isLogRotateActive && (
								<Button
									variant="secondary"
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
									variant="secondary"
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
