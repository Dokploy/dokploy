import { createFileRoute } from "@tanstack/react-router";
import { ShowSchedules } from "@/components/dashboard/application/schedules/show-schedules";
import { ServerFilter } from "@/components/shared/server-filter";
import { Card } from "@/components/ui/card";

function SchedulesPage() {
	return (
		<ServerFilter>
			{(serverId) => (
				<div className="w-full">
					<Card className="h-full bg-sidebar p-2.5 rounded-xl w-full min-h-[45vh]">
						<div className="rounded-xl bg-background shadow-md h-full">
							<ShowSchedules
								scheduleType={serverId ? "server" : "dokploy-server"}
								id={serverId ?? "dokploy-server"}
							/>
						</div>
					</Card>
				</div>
			)}
		</ServerFilter>
	);
}

export const Route = createFileRoute("/dashboard/schedules")({
	component: SchedulesPage,
});
