import { Copy, Loader2, Server } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { telemetryProviderIcons } from "@/components/icons/telemetry-provider-icons";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

type Status = "running" | "not-running" | "stopped" | "unknown";

const statusBadge = (status: Status) => {
	if (status === "running") {
		return <Badge variant="green">Running</Badge>;
	}
	if (status === "not-running") {
		return <Badge variant="yellow">Not running</Badge>;
	}
	if (status === "stopped") {
		return <Badge variant="secondary">Not deployed</Badge>;
	}
	return <Badge variant="destructive">Unreachable</Badge>;
};

export const providerLabel = (provider: { name: string; signals: string[] }) =>
	`${provider.name} (${provider.signals.length === 2 ? "logs and metrics" : provider.signals[0]})`;

export const ShowServers = () => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [selection, setSelection] = useState<Record<string, string[]>>({});
	const [pendingTarget, setPendingTarget] = useState<string | null>(null);
	const [errors, setErrors] = useState<
		Record<string, { title: string; message: string }>
	>({});

	const { data: providers } = api.telemetryProvider.all.useQuery();
	const { data: targets, isPending } =
		api.telemetryProvider.serverStatus.useQuery(undefined, {
			refetchOnWindowFocus: false,
			staleTime: 30_000,
			trpc: { context: { skipBatch: true } },
		});

	const { mutateAsync: deployOnServer } =
		api.telemetryProvider.deployOnServer.useMutation();
	const { mutateAsync: removeOnServer } =
		api.telemetryProvider.removeOnServer.useMutation();

	const keyOf = (serverId: string | null) => serverId ?? "local";

	// The selection can still hold providers deleted since it was made.
	const idsFor = (serverId: string | null, saved: string[]) => {
		const ids = selection[keyOf(serverId)] ?? saved;
		return providers
			? ids.filter((id) => providers.some((p) => p.telemetryProviderId === id))
			: ids;
	};

	const toggleProvider = (
		serverId: string | null,
		saved: string[],
		telemetryProviderId: string,
	) => {
		const key = keyOf(serverId);
		const current = idsFor(serverId, saved);
		setSelection({
			...selection,
			[key]: current.includes(telemetryProviderId)
				? current.filter((id) => id !== telemetryProviderId)
				: [...current, telemetryProviderId],
		});
	};

	const setError = (
		serverId: string | null,
		error?: { title: string; message: string },
	) =>
		setErrors((prev) => {
			const next = { ...prev };
			if (error) {
				next[keyOf(serverId)] = error;
			} else {
				delete next[keyOf(serverId)];
			}
			return next;
		});

	// The task is still starting right after a deploy, so look again once it had time to come up.
	const refreshStatus = () => {
		utils.telemetryProvider.serverStatus.invalidate();
		setTimeout(() => utils.telemetryProvider.serverStatus.invalidate(), 8_000);
	};

	const handleDeploy = async (serverId: string | null, ids: string[]) => {
		setPendingTarget(keyOf(serverId));
		setError(serverId);
		await deployOnServer({ serverId, providerIds: ids })
			.then(() => {
				toast.success(t("settings.logsMetrics.servers.deployed"));
				refreshStatus();
			})
			.catch((error) => {
				setError(serverId, {
					title: t("settings.logsMetrics.servers.deployFailed"),
					message:
						error instanceof Error
							? error.message
							: t("settings.logsMetrics.servers.deployFailedMessage"),
				});
				refreshStatus();
			})
			.finally(() => setPendingTarget(null));
	};

	const handleRemove = async (serverId: string | null) => {
		setPendingTarget(keyOf(serverId));
		setError(serverId);
		await removeOnServer({ serverId })
			.then(() => {
				toast.success(t("settings.logsMetrics.servers.removed"));
				setSelection((prev) => ({ ...prev, [keyOf(serverId)]: [] }));
				refreshStatus();
			})
			.catch((error) => {
				setError(serverId, {
					title: t("settings.logsMetrics.servers.removeFailed"),
					message:
						error instanceof Error
							? error.message
							: t("settings.logsMetrics.servers.removeFailedMessage"),
				});
				refreshStatus();
			})
			.finally(() => setPendingTarget(null));
	};

	const hasProviders = (providers?.length ?? 0) > 0;
	const visibleTargets = hasProviders
		? targets
		: targets?.filter(
				(target) =>
					target.telemetryProviderIds.length > 0 ||
					target.status === "running" ||
					target.status === "not-running",
			);

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Server className="size-6 text-muted-foreground self-center" />
							{t("settings.servers.show.title")}
						</CardTitle>
						<CardDescription>
							{t("settings.logsMetrics.servers.description")}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[15vh]">
								<span>{t("settings.logsMetrics.servers.checking")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !hasProviders && !visibleTargets?.length ? (
							<div className="flex flex-col items-center gap-3 min-h-[15vh] justify-center">
								<Server className="size-8 self-center text-muted-foreground" />
								<span className="text-base text-muted-foreground text-center">
									{t("settings.logsMetrics.servers.addProviderFirst")}
								</span>
							</div>
						) : (
							<div className="flex flex-col gap-4">
								{visibleTargets?.map((target) => {
									const key = keyOf(target.serverId);
									const saved = target.telemetryProviderIds;
									const ids = idsFor(target.serverId, saved);
									const isBusy = pendingTarget === key;
									const agentDeployed = target.status !== "stopped";
									const hasEnabledSelected = ids.some(
										(id) =>
											providers?.find((p) => p.telemetryProviderId === id)
												?.enabled,
									);

									return (
										<div
											key={key}
											className="flex flex-col gap-3 rounded-lg border p-4"
										>
											<div className="flex items-center justify-between">
												<div className="flex flex-col">
													<span className="text-sm font-medium">
														{target.name}
													</span>
													{target.ipAddress && (
														<span className="text-xs text-muted-foreground">
															{target.ipAddress}
														</span>
													)}
												</div>
												<div className="flex items-center gap-2">
													{statusBadge(target.status as Status)}
													{agentDeployed && (
														<DialogAction
															title={t(
																"settings.logsMetrics.servers.removeTitle",
															)}
															description={t(
																"settings.logsMetrics.servers.removeDescription",
															)}
															type="destructive"
															onClick={() => handleRemove(target.serverId)}
														>
															<Button
																variant="ghost"
																size="sm"
																isLoading={isBusy}
															>
																{t("settings.logsMetrics.servers.remove")}
															</Button>
														</DialogAction>
													)}
												</div>
											</div>

											<div className="flex flex-col gap-2">
												{hasProviders && (
													<span className="text-xs font-medium">
														{t("settings.vault.provider.providerLabel")}
													</span>
												)}
												<div className="flex flex-col gap-2">
													{providers?.map((provider) => {
														const ProviderIcon =
															telemetryProviderIcons[
																provider.providerType as keyof typeof telemetryProviderIcons
															];
														return (
															<div
																key={provider.telemetryProviderId}
																className={`flex flex-row items-center gap-2 text-sm ${
																	provider.enabled ? "" : "opacity-60"
																}`}
															>
																<Checkbox
																	id={`${key}-${provider.telemetryProviderId}`}
																	disabled={
																		!provider.enabled &&
																		!ids.includes(provider.telemetryProviderId)
																	}
																	checked={ids.includes(
																		provider.telemetryProviderId,
																	)}
																	onCheckedChange={() =>
																		toggleProvider(
																			target.serverId,
																			saved,
																			provider.telemetryProviderId,
																		)
																	}
																/>
																{ProviderIcon && (
																	<ProviderIcon className="size-4 shrink-0" />
																)}
																<Label
																	htmlFor={`${key}-${provider.telemetryProviderId}`}
																	className={`font-normal ${
																		provider.enabled
																			? "cursor-pointer"
																			: "cursor-not-allowed"
																	}`}
																>
																	{providerLabel(provider)}
																</Label>
																{!provider.enabled && (
																	<Badge variant="secondary">
																		{t("settings.logsMetrics.disabled")}
																	</Badge>
																)}
															</div>
														);
													})}
												</div>
											</div>

											{errors[key] && (
												<AlertBlock type="error" className="items-start">
													<div className="flex w-full flex-col gap-2">
														<span className="font-medium">
															{errors[key].title}
														</span>
														<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background/50 p-2 font-mono text-xs">
															{errors[key].message}
														</pre>
														<Button
															variant="ghost"
															size="sm"
															className="w-fit"
															onClick={() => {
																navigator.clipboard.writeText(
																	errors[key]?.message ?? "",
																);
																toast.success(
																	t("settings.logsMetrics.servers.errorCopied"),
																);
															}}
														>
															<Copy className="size-3.5" />
															{t("settings.logsMetrics.servers.copy")}
														</Button>
													</div>
												</AlertBlock>
											)}

											{hasProviders && (
												<div className="flex items-center justify-end gap-3">
													{ids.length > 0 && !hasEnabledSelected && (
														<span className="text-xs text-muted-foreground">
															{t("settings.logsMetrics.servers.allDisabled")}
														</span>
													)}
													<Button
														size="sm"
														isLoading={isBusy}
														disabled={!hasEnabledSelected}
														onClick={() => handleDeploy(target.serverId, ids)}
													>
														{agentDeployed || saved.length > 0
															? t("settings.logsMetrics.servers.redeploy")
															: t("settings.logsMetrics.servers.deploy")}
													</Button>
												</div>
											)}
										</div>
									);
								})}

								{visibleTargets?.length === 0 && (
									<div className="flex flex-col items-center gap-3 min-h-[15vh] justify-center">
										<Server className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											{t("settings.logsMetrics.servers.noServers")}
										</span>
									</div>
								)}
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
