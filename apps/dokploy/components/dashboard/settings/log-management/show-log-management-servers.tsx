import { Copy, Loader2, ScrollText, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { logProviderIcons } from "@/components/icons/log-provider-icons";
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

type Status = "running" | "stopped" | "unknown";

const statusBadge = (status: Status) => {
	if (status === "running") {
		return <Badge variant="green">Running</Badge>;
	}
	if (status === "stopped") {
		return <Badge variant="secondary">Not deployed</Badge>;
	}
	return <Badge variant="destructive">Unreachable</Badge>;
};

export const ShowLogManagementServers = () => {
	const utils = api.useUtils();
	const [selection, setSelection] = useState<Record<string, string[]>>({});
	const [pendingTarget, setPendingTarget] = useState<string | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});

	const { data: providers } = api.logProvider.all.useQuery();
	const { data: targets, isPending } = api.logProvider.serverStatus.useQuery(
		undefined,
		{
			refetchOnWindowFocus: false,
			staleTime: 30_000,
			trpc: { context: { skipBatch: true } },
		},
	);

	const { mutateAsync: deployOnServer } =
		api.logProvider.deployOnServer.useMutation();
	const { mutateAsync: removeOnServer } =
		api.logProvider.removeOnServer.useMutation();

	const keyOf = (serverId: string | null) => serverId ?? "local";

	const idsFor = (serverId: string | null, saved: string[]) =>
		selection[keyOf(serverId)] ?? saved;

	const toggleProvider = (
		serverId: string | null,
		saved: string[],
		logProviderId: string,
	) => {
		const key = keyOf(serverId);
		const current = selection[key] ?? saved;
		setSelection({
			...selection,
			[key]: current.includes(logProviderId)
				? current.filter((id) => id !== logProviderId)
				: [...current, logProviderId],
		});
	};

	const setError = (serverId: string | null, message?: string) =>
		setErrors((prev) => {
			const next = { ...prev };
			if (message) {
				next[keyOf(serverId)] = message;
			} else {
				delete next[keyOf(serverId)];
			}
			return next;
		});

	const handleDeploy = async (serverId: string | null, ids: string[]) => {
		setPendingTarget(keyOf(serverId));
		setError(serverId);
		await deployOnServer({ serverId, logProviderIds: ids })
			.then(() => {
				toast.success("Vector agent deployed");
				utils.logProvider.serverStatus.invalidate();
			})
			.catch((error) => {
				setError(
					serverId,
					error instanceof Error ? error.message : "Failed to deploy the agent",
				);
			})
			.finally(() => setPendingTarget(null));
	};

	const handleRemove = async (serverId: string | null) => {
		setPendingTarget(keyOf(serverId));
		setError(serverId);
		await removeOnServer({ serverId })
			.then(() => {
				toast.success("Vector agent removed");
				setSelection((prev) => ({ ...prev, [keyOf(serverId)]: [] }));
				utils.logProvider.serverStatus.invalidate();
			})
			.catch((error) => {
				setError(
					serverId,
					error instanceof Error ? error.message : "Failed to remove the agent",
				);
			})
			.finally(() => setPendingTarget(null));
	};

	const hasProviders = (providers?.length ?? 0) > 0;

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Server className="size-6 text-muted-foreground self-center" />
							Servers
						</CardTitle>
						<CardDescription>
							Pick which providers each server ships to, then deploy its Vector
							agent. Changing a provider only takes effect on a server after you
							redeploy it.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[15vh]">
								<span>Checking servers...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !hasProviders ? (
							<div className="flex flex-col items-center gap-3 min-h-[15vh] justify-center">
								<ScrollText className="size-8 self-center text-muted-foreground" />
								<span className="text-base text-muted-foreground text-center">
									Add a log provider first — there's nowhere to ship logs to yet
								</span>
							</div>
						) : (
							<div className="flex flex-col gap-4">
								{targets?.map((target) => {
									const key = keyOf(target.serverId);
									const ids = idsFor(target.serverId, target.logProviderIds);
									const isBusy = pendingTarget === key;
									const isDeployed = target.status === "running";
									const hasEnabledSelected = ids.some(
										(id) =>
											providers?.find((p) => p.logProviderId === id)?.enabled,
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
													{isDeployed && (
														<DialogAction
															title="Remove the Vector agent"
															description="This server will stop shipping container logs until you deploy it again. Continue?"
															type="destructive"
															onClick={() => handleRemove(target.serverId)}
														>
															<Button
																variant="ghost"
																size="sm"
																isLoading={isBusy}
															>
																Remove
															</Button>
														</DialogAction>
													)}
												</div>
											</div>

											<div className="flex flex-col gap-2">
												<span className="text-xs font-medium">
													Log providers
												</span>
												<div className="flex flex-col gap-2">
													{providers?.map((provider) => {
														const ProviderIcon =
															logProviderIcons[
																provider.providerType as keyof typeof logProviderIcons
															];
														return (
															<div
																key={provider.logProviderId}
																className={`flex flex-row items-center gap-2 text-sm ${
																	provider.enabled ? "" : "opacity-60"
																}`}
															>
																<Checkbox
																	id={`${key}-${provider.logProviderId}`}
																	disabled={!provider.enabled}
																	checked={ids.includes(provider.logProviderId)}
																	onCheckedChange={() =>
																		toggleProvider(
																			target.serverId,
																			target.logProviderIds,
																			provider.logProviderId,
																		)
																	}
																/>
																{ProviderIcon && (
																	<ProviderIcon className="size-4 shrink-0" />
																)}
																<Label
																	htmlFor={`${key}-${provider.logProviderId}`}
																	className={`font-normal ${
																		provider.enabled
																			? "cursor-pointer"
																			: "cursor-not-allowed"
																	}`}
																>
																	{provider.name}
																</Label>
																{!provider.enabled && (
																	<Badge variant="secondary">Disabled</Badge>
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
															Deploy failed — the config was not applied, this
															server keeps shipping with its previous one.
														</span>
														<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background/50 p-2 font-mono text-xs">
															{errors[key]}
														</pre>
														<Button
															variant="ghost"
															size="sm"
															className="w-fit"
															onClick={() => {
																navigator.clipboard.writeText(
																	errors[key] ?? "",
																);
																toast.success("Error copied");
															}}
														>
															<Copy className="size-3.5" />
															Copy
														</Button>
													</div>
												</AlertBlock>
											)}

											<div className="flex items-center justify-end gap-3">
												{ids.length > 0 && !hasEnabledSelected && (
													<span className="text-xs text-muted-foreground">
														Every selected provider is disabled — nothing would
														ship.
													</span>
												)}
												<Button
													size="sm"
													isLoading={isBusy}
													disabled={!hasEnabledSelected}
													onClick={() => handleDeploy(target.serverId, ids)}
												>
													{isDeployed ? "Redeploy" : "Deploy"}
												</Button>
											</div>
										</div>
									);
								})}

								{targets?.length === 0 && (
									<div className="flex flex-col items-center gap-3 min-h-[15vh] justify-center">
										<Server className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											You don't have any server yet
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
