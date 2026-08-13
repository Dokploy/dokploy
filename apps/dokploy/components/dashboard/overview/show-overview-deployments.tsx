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

const SUBTAB_VALUES = ["deployments", "queue"] as const;
type SubtabValue = (typeof SUBTAB_VALUES)[number];
const DEFAULT_SUBTAB: SubtabValue = "deployments";

function isValidSubtab(t: string): t is SubtabValue {
	return SUBTAB_VALUES.includes(t as SubtabValue);
}

export const ShowOverviewDeployments = () => {
	const router = useRouter();
	const subtab =
		typeof router.query.subtab === "string" &&
		isValidSubtab(router.query.subtab)
			? router.query.subtab
			: DEFAULT_SUBTAB;

	const setSubtab = (value: string) => {
		if (!isValidSubtab(value)) return;
		const { subtab: _current, ...query } = router.query;
		router.replace(
			{
				pathname: router.pathname,
				query: value === DEFAULT_SUBTAB ? query : { ...query, subtab: value },
			},
			undefined,
			{ shallow: true },
		);
	};

	return (
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
					<Tabs
						value={subtab}
						onValueChange={setSubtab}
						className="w-full min-w-0"
					>
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
	);
};
