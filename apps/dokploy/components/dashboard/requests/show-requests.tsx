import { AlertBlock } from "@/components/shared/alert-block";
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
import { ArrowDownUp } from "lucide-react";
import Link from "next/link";
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
			<div className="w-full">
				<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-8xl mx-auto">
					<div className="rounded-xl bg-background shadow-md ">
						<CardHeader className="">
							<CardTitle className="text-xl flex flex-row gap-2">
								<ArrowDownUp className="size-6 text-muted-foreground self-center" />
								Requests
							</CardTitle>
							<CardDescription>
								See all the incoming requests that pass trough Traefik
							</CardDescription>

							<AlertBlock type="warning">
								When you activate, you need to reload traefik to apply the
								changes, you can reload traefik in{" "}
								<Link
									href="/dashboard/settings/server"
									className="text-primary"
								>
									Settings
								</Link>
							</AlertBlock>
						</CardHeader>
						<CardContent className="space-y-2 py-8 border-t">
							<div className="flex w-full gap-4 justify-end">
								<DialogAction
									title={isActive ? "Deactivate Requests" : "Activate Requests"}
									description="You will also need to restart Traefik to apply the changes"
									type={isActive ? "destructive" : "default"}
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

							<div>
								{isActive ? (
									<RequestDistributionChart />
								) : (
									<div className="flex items-center justify-center min-h-[25vh]">
										<span className="text-muted-foreground py-6">
											You need to activate requests
										</span>
									</div>
								)}
								{isActive && <RequestsTable />}
							</div>
						</CardContent>
					</div>
				</Card>
			</div>
		</>
	);
};
