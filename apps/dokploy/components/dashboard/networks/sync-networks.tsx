"use client";

import { Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
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
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const utils = api.useUtils();

	const { data, isLoading, error, refetch } =
		api.network.networksToSync.useQuery({ serverId }, { enabled: open });

	const importMutation = api.network.import.useMutation();
	const removeMutation = api.network.remove.useMutation();
	const recreateMutation = api.network.recreate.useMutation();

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
				toast.error(`Could not import "${failure.name}"`, {
					description: failure.error,
				});
			}

			setSelected(new Set());
			await utils.network.all.invalidate();

			setOpen(false);
			await refetch();
		} catch (error) {
			toast.error("Error importing networks", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	const onRemoveStale = async (networkId: string, name: string) => {
		try {
			await removeMutation.mutateAsync({ networkId });
			toast.success(`Removed stale record "${name}"`);
			await utils.network.all.invalidate();
			await refetch();
		} catch (error) {
			toast.error("Error removing record", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	const onRecreate = async (networkId: string, name: string) => {
		try {
			await recreateMutation.mutateAsync({ networkId });
			toast.success(`Network "${name}" recreated in Docker`);
			await utils.network.all.invalidate();
			await utils.network.networksToSync.invalidate();
			await refetch();
		} catch (error) {
			toast.error("Error recreating network", {
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
					Sync
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<RefreshCw className="size-5 text-muted-foreground" />
						Sync networks
					</DialogTitle>
					<DialogDescription>
						Import networks that exist in Docker but not in Dokploy, and clean
						up records whose network no longer exists.
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
									Nothing to import — everything is in sync.
								</span>
							)}
						</div>

						{!!data?.missing.length && (
							<>
								<Separator />
								<div className="flex flex-col gap-2">
									<span className="text-sm font-medium">
										Missing in Docker ({data.missing.length})
									</span>
									<span className="text-xs text-muted-foreground">
										These records exist in Dokploy but their network is gone
										from Docker.
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
													Recreate
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Remove stale record ${stale.name}`}
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
