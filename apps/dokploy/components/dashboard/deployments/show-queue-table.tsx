"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, ListTodo, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type QueueRow =
	inferRouterOutputs<AppRouter>["deployment"]["queueList"][number];

const stateVariants: Record<
	string,
	| "default"
	| "secondary"
	| "destructive"
	| "outline"
	| "yellow"
	| "green"
	| "red"
> = {
	pending: "secondary",
	waiting: "secondary",
	active: "yellow",
	delayed: "outline",
	completed: "green",
	failed: "destructive",
	cancelled: "outline",
	paused: "outline",
};

function formatTs(ts?: number): string {
	if (ts == null) return "—";
	const d = new Date(ts);
	return d.toLocaleString();
}

function getJobLabel(
	row: QueueRow,
	t: (key: string, values?: Record<string, string | number>) => string,
): string {
	const d = row.data as {
		applicationType?: string;
		applicationId?: string;
		composeId?: string;
		previewDeploymentId?: string;
		titleLog?: string;
		type?: string;
	};
	if (!d) return String(row.id);
	const type = d.applicationType ?? "job";
	const title = d.titleLog ?? "";
	if (title) return title;
	if (d.applicationId) {
		return t("jobLabelApplication", {
			shortId: d.applicationId.slice(0, 8),
		});
	}
	if (d.composeId) {
		return t("jobLabelCompose", { shortId: d.composeId.slice(0, 8) });
	}
	if (d.previewDeploymentId) {
		return t("jobLabelPreview", {
			shortId: d.previewDeploymentId.slice(0, 8),
		});
	}
	return t("jobLabelFallback", { type, id: String(row.id) });
}

export function ShowQueueTable(props: { embedded?: boolean }) {
	const { embedded: _embedded = false } = props;
	const t = useTranslations("deploymentsCentral.queue");
	const { data: queueList, isLoading } = api.deployment.queueList.useQuery(
		undefined,
		{ refetchInterval: 3000 },
	);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const utils = api.useUtils();
	const {
		mutateAsync: cancelApplicationDeployment,
		isPending: isCancellingApp,
	} = api.application.cancelDeployment.useMutation({
		onSuccess: () => void utils.deployment.queueList.invalidate(),
	});
	const {
		mutateAsync: cancelComposeDeployment,
		isPending: isCancellingCompose,
	} = api.compose.cancelDeployment.useMutation({
		onSuccess: () => void utils.deployment.queueList.invalidate(),
	});
	const isCancelling = isCancellingApp || isCancellingCompose;

	const queueStateLabels: Record<string, string> = {
		pending: t("state.pending"),
		waiting: t("state.waiting"),
		active: t("state.active"),
		delayed: t("state.delayed"),
		completed: t("state.completed"),
		failed: t("state.failed"),
		cancelled: t("state.cancelled"),
		paused: t("state.paused"),
	};

	return (
		<div className="px-0">
			{isLoading ? (
				<div className="flex gap-4 w-full items-center justify-center min-h-[30vh] text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					<span>{t("loading")}</span>
				</div>
			) : (
				<div className="rounded-md border overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("columnJobId")}</TableHead>
								<TableHead>{t("columnLabel")}</TableHead>
								<TableHead>{t("columnType")}</TableHead>
								<TableHead>{t("columnState")}</TableHead>
								<TableHead>{t("columnAdded")}</TableHead>
								<TableHead>{t("columnProcessed")}</TableHead>
								<TableHead>{t("columnFinished")}</TableHead>
								<TableHead>{t("columnError")}</TableHead>
								<TableHead className="w-[100px]">{t("columnActions")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{queueList?.length ? (
								queueList.map((row) => {
									const d = row.data as Record<string, unknown>;
									const appType = d?.applicationType as string | undefined;
									const pathInfo = row.servicePath;
									const hasLink = pathInfo?.href != null;
									return (
										<TableRow key={String(row.id)}>
											<TableCell className="font-mono text-xs">
												{String(row.id)}
											</TableCell>
											<TableCell className="max-w-[200px] truncate">
												{getJobLabel(row, t)}
											</TableCell>
											<TableCell>{appType ?? row.name ?? "—"}</TableCell>
											<TableCell>
												<Badge variant={stateVariants[row.state] ?? "outline"}>
													{queueStateLabels[row.state] ?? row.state}
												</Badge>
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{formatTs(row.timestamp)}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{formatTs(row.processedOn)}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{formatTs(row.finishedOn)}
											</TableCell>
											<TableCell className="max-w-[180px] truncate text-xs text-destructive">
												{row.failedReason ?? "—"}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-1">
													{hasLink ? (
														<Button variant="ghost" size="sm" asChild>
															<Link href={pathInfo!.href!}>
																<ArrowRight className="size-4 mr-1" />
																{t("service")}
															</Link>
														</Button>
													) : (
														<span className="text-muted-foreground text-xs">
															—
														</span>
													)}
													{isCloud &&
														row.state === "active" &&
														(d?.applicationId != null ||
															d?.composeId != null) && (
															<Button
																variant="ghost"
																size="sm"
																className="text-destructive hover:text-destructive"
																disabled={isCancelling}
																onClick={() => {
																	const appId =
																		typeof d.applicationId === "string"
																			? d.applicationId
																			: undefined;
																	const compId =
																		typeof d.composeId === "string"
																			? d.composeId
																			: undefined;
																	if (appId) {
																		void cancelApplicationDeployment({
																			applicationId: appId,
																		});
																	} else if (compId) {
																		void cancelComposeDeployment({
																			composeId: compId,
																		});
																	}
																}}
															>
																<XCircle className="size-4 mr-1" />
																{t("cancel")}
															</Button>
														)}
												</div>
											</TableCell>
										</TableRow>
									);
								})
							) : (
								<TableRow>
									<TableCell colSpan={9} className="text-center py-12">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground min-h-[30vh]">
											<ListTodo className="size-8" />
											<p className="font-medium">{t("emptyTitle")}</p>
											<p className="text-sm">{t("emptyDesc")}</p>
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
