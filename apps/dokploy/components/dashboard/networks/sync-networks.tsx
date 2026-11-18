"use client";

import { Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
}

export const SyncNetworks = ({ serverId }: Props) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const utils = api.useUtils();

	const { data, isLoading, error, refetch } =
		api.network.networksToSync.useQuery({ serverId }, { enabled: open });

	const importMutation = api.network.import.useMutation();
	const removeMutation = api.network.remove.useMutation();
	const recreateMutation = api.network.recreate.useMutation();
	const resyncMutation = api.network.resync.useMutation();

	const toggleSelected = (name: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(name)) {
				next.delete(name);
			} else {
				next.add(name);
			}
			return next;
		});
	};

	const onImport = async () => {
		try {
			const result = await importMutation.mutateAsync({
				serverId,
				names: Array.from(selected),
			});

			if (result.imported.length > 0) {
				toast.success(`Imported ${result.imported.length} network(s)`);
			}
			for (const failure of result.errors) {
				toast.error(t("networks.importFailure", { name: failure.name }), {
					description: failure.error,
				});
			}

			setSelected(new Set());
			await utils.network.all.invalidate();

			setOpen(false);
			await refetch();
		} catch (error) {
			toast.error(t("networks.importError"), {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	const onRemoveStale = async (networkId: string, name: string) => {
		try {
			await removeMutation.mutateAsync({ networkId });
			toast.success(t("networks.staleRemoved", { name }));
			await utils.network.all.invalidate();
			await refetch();
		} catch (error) {
			toast.error(t("networks.removeRecordError"), {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	const onRecreate = async (networkId: string, name: string) => {
		try {
			await recreateMutation.mutateAsync({ networkId });
			toast.success(t("networks.recreated", { name }));
			await utils.network.all.invalidate();
			await utils.network.networksToSync.invalidate();
			await refetch();
		} catch (error) {
			toast.error(t("networks.recreateError"), {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	const onResync = async (networkId: string, name: string) => {
		try {
			await resyncMutation.mutateAsync({ networkId });
			toast.success(t("networks.updatedFromDocker", { name }));
			await utils.network.all.invalidate();
			await utils.network.networksToSync.invalidate();
			await refetch();
		} catch (error) {
			toast.error(t("networks.updateError2"), {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				setOpen(value);
				if (!value) setSelected(new Set());
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline">
					<RefreshCw className="size-4" />
					{t("networks.sync")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<RefreshCw className="size-5 text-muted-foreground" />
						{t("networks.syncTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("networks.syncDescription")}
					</DialogDescription>
				</DialogHeader>

				{error ? (
					<AlertBlock type="error">{error.message}</AlertBlock>
				) : isLoading ? (
					<div className="flex flex-row gap-2 items-center justify-center py-10 text-sm text-muted-foreground">
						<span>Scanning Docker networks...</span>
						<Loader2 className="animate-spin size-4" />
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<span className="text-sm font-medium">
								Found in Docker ({data?.importable.length ?? 0})
							</span>
							{data?.importable.length ? (
								data.importable.map((dockerNetwork) => (
									<label
										key={dockerNetwork.name}
										htmlFor={`import-network-${dockerNetwork.name}`}
										className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3"
									>
										<div className="flex items-center gap-3">
											<Checkbox
												id={`import-network-${dockerNetwork.name}`}
												checked={selected.has(dockerNetwork.name)}
												onCheckedChange={() =>
													toggleSelected(dockerNetwork.name)
												}
											/>
											<div className="flex flex-col">
												<span className="text-sm font-medium">
													{dockerNetwork.name}
												</span>
												{dockerNetwork.subnets.length > 0 && (
													<span className="text-xs text-muted-foreground">
														{dockerNetwork.subnets.join(" · ")}
													</span>
												)}
											</div>
										</div>
										<Badge variant="outline">{dockerNetwork.driver}</Badge>
									</label>
								))
							) : (
								<span className="text-sm text-muted-foreground">
									{t("networks.nothingToImport")}
								</span>
							)}
						</div>

						{!!data?.changed.length && (
							<>
								<Separator />
								<div className="flex flex-col gap-2">
									<span className="text-sm font-medium">
										Changed ({data.changed.length})
									</span>
									<span className="text-xs text-muted-foreground">
										These networks were deleted and recreated in Docker under
										the same name — attributes in Dokploy are outdated.
									</span>
									{data.changed.map((changed) => (
										<div
											key={changed.networkId}
											className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3"
										>
											<div className="flex items-center gap-3">
												<span className="text-sm">{changed.name}</span>
												{changed.driver && (
													<Badge variant="outline">{changed.driver}</Badge>
												)}
											</div>
											<Button
												variant="outline"
												size="xs"
												isLoading={resyncMutation.isPending}
												onClick={() =>
													onResync(changed.networkId, changed.name)
												}
											>
												<RotateCcw className="size-3.5" />
												Update
											</Button>
										</div>
									))}
								</div>
							</>
						)}

						{!!data?.missing.length && (
							<>
								<Separator />
								<div className="flex flex-col gap-2">
									<span className="text-sm font-medium">
										{t("networks.missingInDocker", {
											count: data.missing.length,
										})}
									</span>
									<span className="text-xs text-muted-foreground">
										{t("networks.missingHint")}
									</span>
									{data.missing.map((stale) => (
										<div
											key={stale.networkId}
											className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3"
										>
											<span className="text-sm">{stale.name}</span>
											<div className="flex items-center gap-2">
												<Button
													variant="outline"
													size="xs"
													isLoading={recreateMutation.isPending}
													onClick={() =>
														onRecreate(stale.networkId, stale.name)
													}
												>
													<RotateCcw className="size-3.5" />
													{t("networks.recreate")}
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={t("networks.removeStale", { name: stale.name })}
													isLoading={removeMutation.isPending}
													onClick={() =>
														onRemoveStale(stale.networkId, stale.name)
													}
												>
													<Trash2 className="size-4 text-destructive" />
												</Button>
											</div>
										</div>
									))}
								</div>
							</>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
					>
						Close
					</Button>
					<Button
						type="button"
						disabled={selected.size === 0}
						isLoading={importMutation.isPending}
						onClick={onImport}
					>
						Import selected ({selected.size})
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
