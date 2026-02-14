import { format } from "date-fns";
import { History, Loader2, Info, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { toast } from "sonner";

const PAGE_SIZE = 20;

const RESOURCE_TYPES = [
	{ label: "All Resources", value: "all" },
	{ label: "Project", value: "project" },
	{ label: "Application", value: "application" },
	{ label: "Compose", value: "compose" },
	{ label: "Database", value: "database" },
	{ label: "System", value: "system" },
	{ label: "Organization", value: "organization" },
	{ label: "Domain", value: "domain" },
];

export const ShowActivityLogs = () => {
	const [page, setPage] = useState(1);
	const [resourceType, setResourceType] = useState<string>("all");
	const utils = api.useUtils();

	const { data, isLoading } = api.activityLog.all.useQuery({
		page,
		pageSize: PAGE_SIZE,
		resourceType: resourceType === "all" ? undefined : resourceType,
	});

	const { mutateAsync: purgeLogs, isLoading: isPurging } = api.activityLog.purge.useMutation({
		onSuccess: (res) => {
			toast.success(`Successfully purged ${res.deletedCount} logs.`);
			utils.activityLog.all.invalidate();
		},
		onError: (error) => {
			toast.error(error.message || "Failed to purge logs.");
		},
	});

	const handlePurge = async (days: number) => {
		const message = days === 0 ? "ALL activity logs?" : `activity logs older than ${days} days?`;
		if (confirm(`Are you sure you want to clear ${message}`)) {
			await purgeLogs({
				days,
			});
		}
	};

	const logs = data?.logs || [];
	const totalCount = data?.totalCount || 0;
	const totalPages = Math.ceil(totalCount / PAGE_SIZE);

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
						<div className="space-y-1">
							<CardTitle className="text-xl flex flex-row gap-2">
								<History className="size-6 text-muted-foreground self-center" />
								Activity Logs
							</CardTitle>
							<CardDescription>
								View all actions performed in your organization.
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Select
								value={resourceType}
								onValueChange={(val) => {
									setResourceType(val);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue placeholder="Filter by type" />
								</SelectTrigger>
								<SelectContent>
									{RESOURCE_TYPES.map((type) => (
										<SelectItem key={type.value} value={type.value}>
											{type.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select onValueChange={(val) => handlePurge(parseInt(val))}>
								<SelectTrigger className="w-[140px] text-destructive border-destructive/20 hover:bg-destructive/10">
									<Trash2 className="size-4 mr-2" />
									<SelectValue placeholder="Clear Logs" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="7">Older than 7 days</SelectItem>
									<SelectItem value="30">Older than 30 days</SelectItem>
									<SelectItem value="90">Older than 90 days</SelectItem>
									<SelectItem value="0">Clear All (Careful!)</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[40vh]">
								<span>Loading logs...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{logs.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[40vh] justify-center">
										<History className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											No activity logs found.
										</span>
									</div>
								) : (
									<div className="flex flex-col gap-4">
										<div className="rounded-md border overflow-hidden">
											<Table>
												<TableHeader className="bg-muted/50">
													<TableRow>
														<TableHead>User</TableHead>
														<TableHead>Action</TableHead>
														<TableHead>Resource</TableHead>
														<TableHead className="text-center">Date</TableHead>
														<TableHead className="text-right">Details</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{logs.map((log) => (
														<TableRow key={log.activityLogId}>
															<TableCell className="max-w-[150px] truncate">
																<span className="font-medium text-sm">
																	{log.user?.email || "System"}
																</span>
															</TableCell>
															<TableCell>
																<Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">
																	{log.action.replace(".", " ")}
																</Badge>
															</TableCell>
															<TableCell>
																<div className="flex flex-col">
																	<span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
																		{log.resourceType}
																	</span>
																	<span className="text-xs font-mono text-muted-foreground">
																		{log.resourceId?.substring(0, 8) || "N/A"}
																	</span>
																</div>
															</TableCell>
															<TableCell className="text-center whitespace-nowrap">
																<span className="text-xs text-muted-foreground">
																	{format(new Date(log.createdAt), "MMM d, HH:mm")}
																</span>
															</TableCell>
															<TableCell className="text-right">
																{log.metadata && (
																	<TooltipProvider>
																		<Tooltip>
																			<TooltipTrigger asChild>
																				<Button variant="ghost" size="icon" className="size-6">
																					<Info className="size-3.5 text-muted-foreground" />
																				</Button>
																			</TooltipTrigger>
																			<TooltipContent side="left" className="max-w-xs p-3">
																				<div className="space-y-1.5">
																					<p className="text-[10px] font-bold uppercase text-muted-foreground">Metadata</p>
																					<pre className="text-[10px] overflow-auto max-h-40 font-mono bg-muted p-2 rounded">
																						{JSON.stringify(log.metadata, null, 2)}
																					</pre>
																				</div>
																			</TooltipContent>
																		</Tooltip>
																	</TooltipProvider>
																)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>

										<div className="flex items-center justify-between px-2">
											<p className="text-xs text-muted-foreground">
												Showing <span className="font-medium">{(page - 1) * PAGE_SIZE + 1}</span> to{" "}
												<span className="font-medium">
													{Math.min(page * PAGE_SIZE, totalCount)}
												</span>{" "}
												of <span className="font-medium">{totalCount}</span> logs
											</p>
											<div className="flex items-center gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => setPage((p) => Math.max(1, p - 1))}
													disabled={page === 1}
													className="size-8 p-0"
												>
													<ChevronLeft className="size-4" />
												</Button>
												<span className="text-xs font-medium">
													Page {page} of {totalPages || 1}
												</span>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setPage((p) => p + 1)}
													disabled={page >= totalPages}
													className="size-8 p-0"
												>
													<ChevronRight className="size-4" />
												</Button>
											</div>
										</div>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
