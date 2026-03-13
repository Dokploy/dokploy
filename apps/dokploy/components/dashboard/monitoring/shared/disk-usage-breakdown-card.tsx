import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { DiskPieChart } from "./disk-pie-chart";

type Mode = "all" | "projects" | "services";

export function DiskUsageBreakdownCard() {
	const [mode, setMode] = useState<Mode>("all");
	const { data, isLoading } = api.docker.getDiskUsageBreakdown.useQuery(
		{ mode },
		{ refetchOnWindowFocus: false },
	);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">
					Disk Usage Breakdown
				</CardTitle>
				<div className="w-[180px]">
					<Select value={mode} onValueChange={(v: Mode) => setMode(v)}>
						<SelectTrigger>
							<SelectValue placeholder="View" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All</SelectItem>
							<SelectItem value="projects">Projects</SelectItem>
							<SelectItem value="services">Services</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="text-sm text-muted-foreground">Loading...</div>
				) : data && data.length > 0 ? (
					<DiskPieChart data={data} />
				) : (
					<div className="text-sm text-muted-foreground">No data</div>
				)}
			</CardContent>
		</Card>
	);
}
