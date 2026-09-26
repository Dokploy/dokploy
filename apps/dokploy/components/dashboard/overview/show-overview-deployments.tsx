import { Rocket } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { ShowDeploymentsTable } from "@/components/dashboard/deployments/show-deployments-table";
import { ShowQueueTable } from "@/components/dashboard/deployments/show-queue-table";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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

	const [globalFilter, setGlobalFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [typeFilter, setTypeFilter] = useState<string>("all");

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
						{/* Responsive layout: Tabs on top and filters wrap below on mobile/tablet, inline single-row on lg+ */}
						<div className="flex flex-col lg:flex-row lg:items-center gap-y-4 gap-x-3 mt-2">
							<TabsList className="self-start shrink-0">
								<TabsTrigger value="deployments">Deployments</TabsTrigger>
								<TabsTrigger value="queue">Queue</TabsTrigger>
							</TabsList>
							{subtab === "deployments" && (
								<div className="flex flex-wrap lg:flex-nowrap items-center gap-2 lg:ml-auto">
									<Input
										placeholder="Search by name, project, environment, server..."
										value={globalFilter}
										onChange={(e) => setGlobalFilter(e.target.value)}
										className="max-w-xs"
									/>
									<Select value={statusFilter} onValueChange={setStatusFilter}>
										<SelectTrigger className="w-[140px]">
											<SelectValue placeholder="Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All statuses</SelectItem>
											<SelectItem value="running">Running</SelectItem>
											<SelectItem value="done">Done</SelectItem>
											<SelectItem value="error">Error</SelectItem>
											<SelectItem value="cancelled">Cancelled</SelectItem>
										</SelectContent>
									</Select>
									<Select value={typeFilter} onValueChange={setTypeFilter}>
										<SelectTrigger className="w-[140px]">
											<SelectValue placeholder="Type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All types</SelectItem>
											<SelectItem value="application">Application</SelectItem>
											<SelectItem value="compose">Compose</SelectItem>
										</SelectContent>
									</Select>
								</div>
							)}
						</div>
						<TabsContent value="deployments" className="mt-0 min-w-0 pt-4">
							<ShowDeploymentsTable
								globalFilter={globalFilter}
								statusFilter={statusFilter}
								typeFilter={typeFilter}
							/>
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
