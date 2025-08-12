import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";
import { formatRelative, formatDistanceToNow } from "date-fns";
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Code,
	Loader2,
	RefreshCw,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "next-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
	webhookId: string;
	open: boolean;
	onClose: () => void;
}

export const ShowWebhookDeliveries = ({ webhookId, open, onClose }: Props) => {
	const { t } = useTranslation("webhook");
	const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);

	const {
		data: deliveries,
		isLoading,
		refetch,
	} = api.webhook.getDeliveries.useQuery(
		{ webhookId, limit: 50 },
		{ enabled: open && !!webhookId }
	);

	const { data: stats } = api.webhook.getStats.useQuery(
		{ webhookId },
		{ enabled: open && !!webhookId }
	);

	const getStatusIcon = (statusCode?: string) => {
		if (!statusCode || statusCode === "0") {
			return <XCircle className="size-4 text-destructive" />;
		}
		const code = parseInt(statusCode);
		if (code >= 200 && code < 300) {
			return <CheckCircle2 className="size-4 text-green-500" />;
		}
		if (code >= 400) {
			return <AlertCircle className="size-4 text-destructive" />;
		}
		return <Clock className="size-4 text-yellow-500" />;
	};

	const getStatusBadge = (statusCode?: string) => {
		if (!statusCode || statusCode === "0") {
			return (
				<Badge variant="destructive" className="text-xs">
					Failed
				</Badge>
			);
		}
		const code = parseInt(statusCode);
		if (code >= 200 && code < 300) {
			return (
				<Badge variant="success" className="text-xs">
					{statusCode}
				</Badge>
			);
		}
		if (code >= 400) {
			return (
				<Badge variant="destructive" className="text-xs">
					{statusCode}
				</Badge>
			);
		}
		return (
			<Badge variant="secondary" className="text-xs">
				{statusCode}
			</Badge>
		);
	};

	const formatResponseTime = (responseTime?: string) => {
		if (!responseTime) return "-";
		const ms = parseInt(responseTime);
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	};

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="max-w-5xl max-h-[85vh]">
				<DialogHeader>
					<DialogTitle>{t("deliveries.title")}</DialogTitle>
					<DialogDescription>
						Recent webhook delivery attempts and their status
					</DialogDescription>
				</DialogHeader>

				{stats && (
					<div className="grid grid-cols-4 gap-4 py-4">
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Total Deliveries</p>
							<p className="text-2xl font-bold">{stats.total}</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Successful</p>
							<p className="text-2xl font-bold text-green-500">
								{stats.successful}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Failed</p>
							<p className="text-2xl font-bold text-destructive">
								{stats.failed}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Avg Response Time</p>
							<p className="text-2xl font-bold">
								{formatResponseTime(stats.avgResponseTime.toString())}
							</p>
						</div>
					</div>
				)}

				<div className="border rounded-lg">
					{isLoading ? (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : deliveries && deliveries.length > 0 ? (
						<ScrollArea className="h-[400px]">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[40px]"></TableHead>
										<TableHead>Event</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Response Time</TableHead>
										<TableHead>Attempts</TableHead>
										<TableHead>Delivered At</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{deliveries.map((delivery) => (
										<Collapsible
											key={delivery.deliveryId}
											open={expandedDelivery === delivery.deliveryId}
											onOpenChange={(open) =>
												setExpandedDelivery(
													open ? delivery.deliveryId : null
												)
											}
										>
											<CollapsibleTrigger asChild>
												<TableRow className="cursor-pointer hover:bg-muted/50">
													<TableCell>
														<ChevronDown
															className={cn(
																"size-4 transition-transform",
																expandedDelivery ===
																	delivery.deliveryId &&
																	"rotate-180"
															)}
														/>
													</TableCell>
													<TableCell className="font-medium">
														<div className="flex items-center gap-2">
															{getStatusIcon(delivery.statusCode)}
															<span className="text-sm">
																{delivery.event}
															</span>
														</div>
													</TableCell>
													<TableCell>
														{getStatusBadge(delivery.statusCode)}
													</TableCell>
													<TableCell>
														{formatResponseTime(
															delivery.responseTime
														)}
													</TableCell>
													<TableCell>
														<Badge variant="outline" className="text-xs">
															{delivery.attempts}
														</Badge>
													</TableCell>
													<TableCell className="text-muted-foreground text-sm">
														{formatDistanceToNow(
															new Date(delivery.deliveredAt),
															{ addSuffix: true }
														)}
													</TableCell>
												</TableRow>
											</CollapsibleTrigger>
											<CollapsibleContent asChild>
												<TableRow>
													<TableCell colSpan={6} className="bg-muted/30">
														<div className="p-4 space-y-4">
															{delivery.error && (
																<div className="space-y-2">
																	<p className="text-sm font-medium flex items-center gap-2">
																		<AlertCircle className="size-4 text-destructive" />
																		Error
																	</p>
																	<div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm font-mono">
																		{delivery.error}
																	</div>
																</div>
															)}
															<div className="space-y-2">
																<p className="text-sm font-medium flex items-center gap-2">
																	<Code className="size-4" />
																	Payload
																</p>
																<div className="bg-muted rounded-md p-3">
																	<pre className="text-xs overflow-x-auto">
																		{JSON.stringify(
																			delivery.payload,
																			null,
																			2
																		)}
																	</pre>
																</div>
															</div>
														</div>
													</TableCell>
												</TableRow>
											</CollapsibleContent>
										</Collapsible>
									))}
								</TableBody>
							</Table>
						</ScrollArea>
					) : (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<RefreshCw className="size-8 text-muted-foreground/50 mb-2" />
							<p className="text-sm text-muted-foreground">
								No deliveries yet
							</p>
							<p className="text-xs text-muted-foreground/70 mt-1">
								Webhook deliveries will appear here once triggered
							</p>
						</div>
					)}
				</div>

				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => refetch()}>
						<RefreshCw className="size-4 mr-2" />
						Refresh
					</Button>
					<Button variant="secondary" onClick={onClose}>
						Close
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
};