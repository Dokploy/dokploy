import { format } from "date-fns";
import {
	AlertCircle,
	ArrowDownUp,
	Calendar as CalendarIcon,
	InfoIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, type RouterOutputs } from "@/utils/api";
import { RequestDistributionChart } from "./request-distribution-chart";
import { RequestsTable } from "./requests-table";

export type LogEntry = NonNullable<
	RouterOutputs["settings"]["readStatsLogs"]["data"]
>[0];

export const ShowRequests = () => {
	const { t } = useTranslation();
	const { data: isActive, refetch } =
		api.settings.haveActivateRequests.useQuery();
	const { mutateAsync: toggleRequests } =
		api.settings.toggleRequests.useMutation();

	const { data: logCleanupStatus } =
		api.settings.getLogCleanupStatus.useQuery();
	const { mutateAsync: updateLogCleanup } =
		api.settings.updateLogCleanup.useMutation();
	const [cronExpression, setCronExpression] = useState<string | null>(null);

	// Set default date range to last 3 days
	const getDefaultDateRange = () => {
		const to = new Date();
		const from = new Date();
		from.setDate(from.getDate() - 3);
		return { from, to };
	};

	const [dateRange, setDateRange] = useState<{
		from: Date | undefined;
		to: Date | undefined;
	}>(() => getDefaultDateRange());

	// Check if logs exist to determine if traefik has been reloaded
	// Only fetch when active to minimize network calls
	const { data: statsLogsCheck } = api.settings.readStatsLogs.useQuery(
		{
			page: {
				pageIndex: 0,
				pageSize: 1,
			},
		},
		{
			enabled: !!isActive,
			refetchInterval: 5000, // Check every 5 seconds when active
		},
	);

	// Determine if warning should be shown
	// Show warning only if active but no logs exist yet
	const shouldShowWarning = isActive && (statsLogsCheck?.totalCount ?? 0) === 0;

	useEffect(() => {
		if (logCleanupStatus) {
			setCronExpression(logCleanupStatus.cronExpression || "0 0 * * *");
		}
	}, [logCleanupStatus]);

	return (
		<>
			<div className="w-full">
				<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-8xl mx-auto">
					<div className="rounded-xl bg-background shadow-md ">
						<CardHeader className="">
							<CardTitle className="text-xl flex flex-row gap-2">
								<ArrowDownUp className="size-6 text-muted-foreground self-center" />
								{t("requests.title")}
							</CardTitle>
							<CardDescription>{t("requests.description")}</CardDescription>

							{shouldShowWarning && (
								<AlertBlock type="warning">
									{t("requests.activateWarningPrefix")}
									<Link
										href="/dashboard/settings/server"
										className="text-primary"
									>
										{t("requests.settingsLink")}
									</Link>
								</AlertBlock>
							)}
						</CardHeader>
						<CardContent className="space-y-2 py-8 border-t">
							<div className="flex w-full gap-4 justify-end items-center">
								<div className="flex-1 flex items-center gap-4">
									<div className="flex items-center gap-2">
										<Label htmlFor="cron" className="min-w-32">
											{t("requests.logCleanupSchedule")}
										</Label>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger>
													<InfoIcon className="size-4 text-muted-foreground" />
												</TooltipTrigger>
												<TooltipContent>
													<p className="max-w-80">
														{t("requests.logCleanupHint")}
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>
									<div className="flex-1 flex gap-4">
										<Input
											id="cron"
											placeholder="0 0 * * *"
											value={cronExpression || ""}
											onChange={(e) => setCronExpression(e.target.value)}
											className="max-w-60"
											required
										/>
										<Button
											variant="outline"
											onClick={async () => {
												if (!cronExpression?.trim()) {
													toast.error(t("requests.invalidCron"));
													return;
												}
												try {
													await updateLogCleanup({
														cronExpression: cronExpression,
													});
													toast.success(t("requests.cleanupUpdated"));
												} catch (error) {
													toast.error(
														t("requests.cleanupUpdateFailed", {
															error:
																error instanceof Error
																	? error.message
																	: "Unknown error",
														}),
													);
												}
											}}
										>
											{t("requests.updateSchedule")}
										</Button>
									</div>
								</div>
								<DialogAction
									title={
										isActive
											? t("requests.deactivateTitle")
											: t("requests.activateTitle")
									}
									description={t("requests.restartTraefikHint")}
									type={isActive ? "destructive" : "default"}
									onClick={async () => {
										await toggleRequests({ enable: !isActive })
											.then(() => {
												refetch();
												toast.success(
													isActive
														? t("requests.deactivatedToast")
														: t("requests.activatedToast"),
												);
											})
											.catch((err) => {
												toast.error(err.message);
											});
									}}
								>
									<Button>
										{isActive
											? t("requests.deactivate")
											: t("requests.activate")}
									</Button>
								</DialogAction>
							</div>

							{isActive ? (
								<>
									<div className="flex justify-end mb-4 gap-2">
										<Button
											variant="outline"
											onClick={() => setDateRange(getDefaultDateRange())}
											className="px-3"
										>
											{t("requests.resetRange")}
										</Button>
										<Popover>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													className="w-[300px] justify-start text-left font-normal"
												>
													<CalendarIcon className="mr-2 h-4 w-4" />
													{dateRange.from ? (
														dateRange.to ? (
															<>
																{format(dateRange.from, "LLL dd, y")} -{" "}
																{format(dateRange.to, "LLL dd, y")}
															</>
														) : (
															format(dateRange.from, "LLL dd, y")
														)
													) : (
														<span>{t("requests.pickDateRange")}</span>
													)}
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-auto p-0" align="end">
												<Calendar
													autoFocus
													mode="range"
													defaultMonth={dateRange.from}
													selected={{
														from: dateRange.from,
														to: dateRange.to,
													}}
													onSelect={(range) => {
														setDateRange({
															from: range?.from,
															to: range?.to,
														});
													}}
													numberOfMonths={2}
												/>
											</PopoverContent>
										</Popover>
									</div>
									<RequestDistributionChart dateRange={dateRange} />
									<RequestsTable dateRange={dateRange} />
								</>
							) : (
								<div className="flex flex-col items-center justify-center py-12 gap-4 text-muted-foreground">
									<AlertCircle className="size-12 text-muted-foreground/50" />
									<div className="text-center space-y-2">
										<h3 className="text-lg font-medium">
											{t("requests.notActivatedTitle")}
										</h3>
										<p className="text-sm max-w-md">
											{t("requests.notActivatedDescription")}
										</p>
									</div>
								</div>
							)}
						</CardContent>
					</div>
				</Card>
			</div>
		</>
	);
};
