import { Activity, Loader2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api, type RouterOutputs } from "@/utils/api";

interface Props {
	serverId?: string;
}

type DockerEvent = RouterOutputs["docker"]["getEvents"]["events"][number];

const RANGE_OPTIONS = [
	{ label: "Last 5 minutes", value: 5 },
	{ label: "Last 15 minutes", value: 15 },
	{ label: "Last hour", value: 60 },
	{ label: "Last 6 hours", value: 360 },
	{ label: "Last 24 hours", value: 1440 },
];

type BadgeVariant = "blue" | "green" | "yellow" | "orange" | "red" | "blank";

const TYPE_VARIANTS: Record<string, BadgeVariant> = {
	container: "blue",
	image: "green",
	volume: "yellow",
	network: "orange",
	service: "blue",
	node: "orange",
};

const ACTION_VARIANTS: Record<string, BadgeVariant> = {
	create: "green",
	start: "green",
	pull: "green",
	connect: "green",
	die: "red",
	destroy: "red",
	kill: "red",
	stop: "red",
	remove: "red",
	disconnect: "red",
	pause: "yellow",
	unpause: "yellow",
};

const getTypeVariant = (type?: string): BadgeVariant =>
	(type && TYPE_VARIANTS[type]) || "blank";

const getActionVariant = (action?: string): BadgeVariant =>
	(action && ACTION_VARIANTS[action]) || "blank";

export const ShowDockerEvents = ({ serverId }: Props) => {
	const [minutes, setMinutes] = useState(15);
	const [search, setSearch] = useState("");

	const { data, isLoading, isRefetching, refetch, error } =
		api.docker.getEvents.useQuery({
			serverId,
			minutes,
		});

	const events = data?.events ?? [];

	const filteredEvents = useMemo(() => {
		if (!search.trim()) return events;
		const query = search.toLowerCase();
		return events.filter((event) => {
			return (
				event.Type?.toLowerCase().includes(query) ||
				event.Action?.toLowerCase().includes(query) ||
				event.Actor?.Attributes?.name?.toLowerCase().includes(query) ||
				event.Actor?.ID?.toLowerCase().includes(query)
			);
		});
	}, [events, search]);

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<CardTitle className="text-xl flex flex-row gap-2">
									<Activity className="size-6 text-muted-foreground self-center" />
									Docker Events
								</CardTitle>
								<CardDescription>
									Events reported by the Docker daemon, equivalent to running
									"docker events".
								</CardDescription>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => refetch()}
								disabled={isRefetching}
							>
								<RefreshCw
									className={`size-4 mr-1 ${isRefetching ? "animate-spin" : ""}`}
								/>
								Refresh
							</Button>
						</div>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						{error && (
							<p className="text-sm text-destructive">{error.message}</p>
						)}
						<div className="flex flex-wrap items-center gap-2">
							<Input
								placeholder="Filter by type, action or name..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="max-w-xs"
							/>
							<Select
								value={String(minutes)}
								onValueChange={(value) => setMinutes(Number(value))}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{RANGE_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={String(option.value)}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="rounded-md border overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[110px]">Time</TableHead>
										<TableHead className="w-[100px]">Type</TableHead>
										<TableHead className="w-[110px]">Action</TableHead>
										<TableHead>Resource</TableHead>
										<TableHead>Attributes</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{isLoading ? (
										<TableRow>
											<TableCell
												colSpan={5}
												className="h-24 text-center text-muted-foreground"
											>
												<div className="flex flex-row items-center justify-center gap-2">
													<span>Loading events...</span>
													<Loader2 className="size-4 animate-spin" />
												</div>
											</TableCell>
										</TableRow>
									) : filteredEvents.length ? (
										filteredEvents.map((event: DockerEvent, index: number) => {
											const attributes = Object.entries(
												event.Actor?.Attributes ?? {},
											).filter(([key]) => key !== "name");
											const attributesText =
												attributes
													.map(([key, value]) => `${key}=${value}`)
													.join(" ") || "-";
											const resource =
												event.Actor?.Attributes?.name ?? event.Actor?.ID ?? "-";

											return (
												<TableRow
													key={`${event.time}-${event.Action}-${index}`}
												>
													<TableCell className="text-xs text-muted-foreground whitespace-nowrap">
														{event.time
															? new Date(event.time * 1000).toLocaleTimeString()
															: "-"}
													</TableCell>
													<TableCell>
														<Badge variant={getTypeVariant(event.Type)}>
															{event.Type ?? "unknown"}
														</Badge>
													</TableCell>
													<TableCell>
														<Badge variant={getActionVariant(event.Action)}>
															{event.Action ?? "-"}
														</Badge>
													</TableCell>
													<TableCell
														className="max-w-[220px] truncate font-mono text-xs"
														title={resource}
													>
														{resource}
													</TableCell>
													<TableCell
														className="max-w-[360px] truncate text-xs text-muted-foreground"
														title={attributesText}
													>
														{attributesText}
													</TableCell>
												</TableRow>
											);
										})
									) : (
										<TableRow>
											<TableCell
												colSpan={5}
												className="h-24 text-center text-muted-foreground"
											>
												No events found in the selected time range.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
