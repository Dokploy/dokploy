import { createFileRoute } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { useRouter } from "next/router";
import { ShowDeploymentsTable } from "@/components/dashboard/deployments/show-deployments-table";
import { ShowQueueTable } from "@/components/dashboard/deployments/show-queue-table";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_VALUES = ["deployments", "queue"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isValidTab(t: string): t is TabValue {
	return TAB_VALUES.includes(t as TabValue);
}

function DeploymentsPage() {
	const router = useRouter();
	const tab =
		router.query.tab && isValidTab(router.query.tab as string)
			? (router.query.tab as TabValue)
			: "deployments";

	const setTab = (value: string) => {
		if (!isValidTab(value)) return;
		router.replace(
			{ pathname: "/dashboard/deployments", query: { tab: value } },
			undefined,
			{ shallow: true },
		);
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl min-h-[45vh]">
				<div className="rounded-xl bg-background shadow-md h-full">
					<CardHeader>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle className="text-xl font-bold flex items-center gap-2">
									<Rocket className="size-5" />
									Deployments
								</CardTitle>
								<CardDescription>
									All application and compose deployments in one place.
								</CardDescription>
							</div>
						</div>
						<Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
							<TabsList className="mt-2">
								<TabsTrigger value="deployments">Deployments</TabsTrigger>
								<TabsTrigger value="queue">Queue</TabsTrigger>
							</TabsList>
							<TabsContent value="deployments" className="mt-0 min-w-0 pt-4">
								<ShowDeploymentsTable />
							</TabsContent>
							<TabsContent value="queue" className="mt-0 pt-4">
								<ShowQueueTable />
							</TabsContent>
						</Tabs>
					</CardHeader>
				</div>
			</Card>
		</div>
	);
}

export const Route = createFileRoute("/dashboard/deployments")({
	component: DeploymentsPage,
});
