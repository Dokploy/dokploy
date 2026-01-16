import {
	CheckCircle2,
	Edit,
	ExternalLink,
	GlobeIcon,
	Loader2,
	PlusIcon,
	Server,
	Trash2,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
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
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { AddProxy } from "./add-proxy";
import { WildcardIndicator } from "./wildcard-indicator";

export const ProxyList = () => {
	const { data, isLoading, refetch } = api.proxy.all.useQuery();
	const { mutateAsync: deleteProxy, isLoading: isDeleting } =
		api.proxy.delete.useMutation();
	const { mutateAsync: testProxy, isLoading: isTesting } =
		api.proxy.test.useMutation();

	const handleDelete = async (proxyId: string) => {
		await deleteProxy({ proxyId })
			.then(() => {
				toast.success("Proxy deleted successfully");
				refetch();
			})
			.catch(() => {
				toast.error("Error deleting proxy");
			});
	};

	const handleTest = async (proxyId: string) => {
		await testProxy({ proxyId })
			.then((result) => {
				if (result.success) {
					toast.success(result.message || "Proxy test successful");
				} else {
					toast.error(result.message || "Proxy test failed");
				}
			})
			.catch(() => {
				toast.error("Error testing proxy");
			});
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-7xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<GlobeIcon className="size-6 text-muted-foreground self-center" />
							Reverse Proxies
						</CardTitle>
						<CardDescription>
							Manage reverse proxy configurations for your services
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<GlobeIcon className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											You don't have any proxies configured
										</span>
										<AddProxy />
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg">
											{data?.map((proxy) => (
												<div
													key={proxy.proxyId}
													className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
														<div className="flex items-center gap-4 flex-1">
															<div className="flex flex-col gap-2 flex-1">
																<div className="flex items-center gap-2">
																	<span className="text-sm font-medium">
																		{proxy.name}
																	</span>
																	{proxy.isWildcard && (
																		<WildcardIndicator />
																	)}
																	<Badge
																		variant={
																			proxy.status === "active"
																				? "default"
																				: proxy.status === "inactive"
																					? "secondary"
																					: "destructive"
																		}
																	>
																		{proxy.status}
																	</Badge>
																</div>
																<div className="flex items-center gap-2 text-xs text-muted-foreground">
																	<GlobeIcon className="size-3" />
																	<span>{proxy.host}</span>
																	{proxy.path && proxy.path !== "/" && (
																		<span>• {proxy.path}</span>
																	)}
																	{proxy.https && (
																		<Badge variant="outline" className="text-xs">
																			HTTPS
																		</Badge>
																	)}
																</div>
																<div className="flex items-center gap-2 text-xs text-muted-foreground">
																	<Server className="size-3" />
																	<span>
																		{proxy.targetType === "url"
																			? proxy.targetUrl
																			: `${proxy.targetType}: ${proxy.targetId || "N/A"}`}
																	</span>
																</div>
															</div>
														</div>

														<div className="flex flex-row gap-1">
															<TooltipProvider delayDuration={0}>
																<Tooltip>
																	<TooltipTrigger asChild>
																		<Button
																			variant="ghost"
																			size="icon"
																			className="group hover:bg-blue-500/10"
																			onClick={() => handleTest(proxy.proxyId)}
																			disabled={isTesting}
																		>
																			<ExternalLink className="size-4 text-primary group-hover:text-blue-500" />
																		</Button>
																	</TooltipTrigger>
																	<TooltipContent>Test Proxy</TooltipContent>
																</Tooltip>
															</TooltipProvider>
															<AddProxy proxyId={proxy.proxyId}>
																<Button
																	variant="ghost"
																	size="icon"
																	className="group hover:bg-blue-500/10"
																>
																	<Edit className="size-4 text-primary group-hover:text-blue-500" />
																</Button>
															</AddProxy>
															<DialogAction
																title="Delete Proxy"
																description="Are you sure you want to delete this proxy? This action cannot be undone."
																type="destructive"
																onClick={async () => {
																	await handleDelete(proxy.proxyId);
																}}
															>
																<Button
																	variant="ghost"
																	size="icon"
																	className="group hover:bg-red-500/10"
																	isLoading={isDeleting}
																>
																	<Trash2 className="size-4 text-primary group-hover:text-red-500" />
																</Button>
															</DialogAction>
														</div>
													</div>
												</div>
											))}
										</div>

										<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
											<AddProxy />
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

