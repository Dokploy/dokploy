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
import { type RouterOutputs, api } from "@/utils/api";
import { format } from "date-fns";
import {
	AlertCircle,
	ArrowDownUp,
	Calendar as CalendarIcon,
	InfoIcon,
} from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RequestDistributionChart } from "./request-distribution-chart";
import { RequestsTable } from "./requests-table";

export type LogEntry = NonNullable<
	RouterOutputs["settings"]["readStatsLogs"]["data"]
>[0];

export const ShowRequests = () => {
	const { t } = useTranslation("dashboard");
	const { data: isActive, refetch } =
		api.settings.haveActivateRequests.useQuery();
	const { mutateAsync: toggleRequests } =
		api.settings.toggleRequests.useMutation();

	const { data: logCleanupStatus } =
		api.settings.getLogCleanupStatus.useQuery();
	const { mutateAsync: updateLogCleanup } =
		api.settings.updateLogCleanup.useMutation();
	const [cronExpression, setCronExpression] = useState<string | null>(null);
	const [dateRange, setDateRange] = useState<{
		from: Date | undefined;
		to: Date | undefined;
	}>({
		from: undefined,
		to: undefined,
	});

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
								{t("dashboard.requests.title")}
							</CardTitle>
							<CardDescription>
								{t("dashboard.requests.description")}
							</CardDescription>

							<AlertBlock type="warning">
								{t("dashboard.requests.warningMessage")}{" "}
								<Link
									href="/dashboard/settings/server"
									className="text-primary"
								>
									{t("dashboard.requests.settings")}
								</Link>
							</AlertBlock>
						</CardHeader>
						<CardContent className="space-y-2 py-8 border-t">
							<div className="flex w-full gap-4 justify-end items-center">
								<div className="flex-1 flex items-center gap-4">
									<div className="flex items-center gap-2">
										<Label htmlFor="cron" className="min-w-32">
											{t("dashboard.requests.logCleanupSchedule")}
										</Label>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger>
													<InfoIcon className="size-4 text-muted-foreground" />
												</TooltipTrigger>
												<TooltipContent>
													<p className="max-w-80">
														{t("dashboard.requests.logCleanupTooltip")}
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
													toast.error(
														t("dashboard.requests.invalidCronExpression"),
													);
													return;
												}
												try {
													await updateLogCleanup({
														cronExpression: cronExpression,
													});
													toast.success(
														t("dashboard.requests.logCleanupUpdated"),
													);
												} catch (error) {
													toast.error(
														`${t(
															"dashboard.requests.logCleanupUpdateError",
														)}: ${
															error instanceof Error
																? error.message
																: "Unknown error"
														}`,
													);
												}
											}}
										>
											{t("dashboard.requests.updateSchedule")}
										</Button>
									</div>
								</div>
								<DialogAction
									title={
										isActive
											? t("dashboard.requests.deactivateRequests")
											: t("dashboard.requests.activateRequests")
									}
									description={t("dashboard.requests.activateDescription")}
									type={isActive ? "destructive" : "default"}
									onClick={async () => {
										await toggleRequests({ enable: !isActive })
											.then(() => {
												refetch();
												toast.success(
													t(
														isActive
															? "dashboard.requests.deactivated"
															: "dashboard.requests.activated",
													),
												);
											})
											.catch((err) => {
												toast.error(err.message);
											});
									}}
								>
									<Button>
										{isActive
											? t("dashboard.requests.deactivate")
											: t("dashboard.requests.activate")}
									</Button>
								</DialogAction>
							</div>

							{isActive ? (
								<>
									<div className="flex justify-end mb-4 gap-2">
										{(dateRange.from || dateRange.to) && (
											<Button
												variant="outline"
												onClick={() =>
													setDateRange({ from: undefined, to: undefined })
												}
												className="px-3"
											>
												{t("dashboard.requests.clearDates")}
											</Button>
										)}
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
														<span>{t("dashboard.requests.pickDateRange")}</span>
													)}
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-auto p-0" align="end">
												<Calendar
													initialFocus
													mode="range"
													defaultMonth={dateRange?.from}
													selected={dateRange}
													onSelect={(range) =>
														setDateRange(
															range
																? { from: range.from, to: range.to }
																: { from: undefined, to: undefined },
														)
													}
													numberOfMonths={2}
												/>
											</PopoverContent>
										</Popover>
									</div>

									<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
										<Card className="col-span-4">
											<CardHeader>
												<CardTitle>
													{t("dashboard.requests.overview")}
												</CardTitle>
											</CardHeader>
											<CardContent className="pl-2">
												<RequestDistributionChart dateRange={dateRange} />
											</CardContent>
										</Card>
										<Card className="col-span-3">
											<CardHeader>
												<CardTitle>
													{t("dashboard.requests.recentRequests")}
												</CardTitle>
											</CardHeader>
											<CardContent>
												<RequestsTable dateRange={dateRange} />
											</CardContent>
										</Card>
									</div>
								</>
							) : (
								<div className="flex flex-col items-center justify-center h-[55vh]">
									<AlertCircle className="size-8 text-muted-foreground" />
									<span className="text-muted-foreground text-lg font-medium">
										{t("dashboard.requests.notActive")}
									</span>
								</div>
							)}
						</CardContent>
					</div>
				</Card>
			</div>
		</>
	);
};
