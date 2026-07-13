import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

interface Props {
	open: boolean;
	onOpenChange: (next: boolean) => void;
	existingZoneIds: string[];
}

export const AddZoneDialog = ({
	open,
	onOpenChange,
	existingZoneIds,
}: Props) => {
	const utils = api.useUtils();
	const {
		data: zones,
		isPending,
		isFetching,
		error: zonesError,
		refetch,
	} = api.cloudflare.listAvailableZones.useQuery(undefined, { enabled: open });
	const [selected, setSelected] = useState<Record<string, boolean>>({});

	useEffect(() => {
		if (!open) setSelected({});
	}, [open]);

	const addMut = api.cloudflare.addZones.useMutation({
		onSuccess: async (_result, variables) => {
			toast.success(
				variables.zones.length === 1
					? "Zone added"
					: `${variables.zones.length} zones added`,
			);
			await Promise.all([
				utils.cloudflare.getConfig.invalidate(),
				utils.cloudflare.getLocalTunnelAccountChoice.invalidate(),
				utils.cloudflare.getServerTunnelAccountChoice.invalidate(),
			]);
			onOpenChange(false);
		},
		onError: (error) => toast.error(error.message),
	});

	const existingIds = useMemo(
		() => new Set(existingZoneIds),
		[existingZoneIds],
	);
	const available = (zones ?? []).filter((zone) => !existingIds.has(zone.id));
	const groupedZones = Object.values(
		available.reduce<
			Record<
				string,
				{
					account: { id: string; name: string };
					zones: typeof available;
				}
			>
		>((groups, zone) => {
			const key = zone.account.id;
			groups[key] = groups[key] ?? { account: zone.account, zones: [] };
			groups[key]?.zones.push(zone);
			return groups;
		}, {}),
	).sort((a, b) => a.account.name.localeCompare(b.account.name));
	const selectedCount = available.filter((zone) => selected[zone.id]).length;

	const toggleAll = (next: boolean) => {
		setSelected(Object.fromEntries(available.map((zone) => [zone.id, next])));
	};

	const submit = () => {
		const picked = available.filter((zone) => selected[zone.id]);
		if (picked.length === 0) return;
		addMut.mutate({
			zones: picked.map((zone) => ({
				zoneId: zone.id,
				zoneName: zone.name,
				accountId: zone.account.id,
				status: zone.status,
			})),
		});
	};

	const handleOpenChange = (next: boolean) => {
		if (!addMut.isPending) onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Cloudflare zones</DialogTitle>
					<DialogDescription>
						Select the zones Dokploy may use for managed domains. Zones are
						grouped by their Cloudflare account.
					</DialogDescription>
				</DialogHeader>

				{isPending || (isFetching && !zones?.length) ? (
					<div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Loading zones…
					</div>
				) : zonesError ? (
					<div className="space-y-3 py-4">
						<AlertBlock type="error">
							<p className="font-medium">
								Could not load zones from Cloudflare.
							</p>
							<p className="text-xs">{zonesError.message}</p>
						</AlertBlock>
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							<RotateCcw className="size-4" />
							Try again
						</Button>
					</div>
				) : (zones?.length ?? 0) === 0 ? (
					<AlertBlock type="warning" className="my-4">
						No zones are accessible with this token. Check its Zone read
						permission and zone resource scope.
					</AlertBlock>
				) : available.length === 0 ? (
					<div className="py-10 text-center text-sm text-muted-foreground">
						Every zone available to this token is already configured.
					</div>
				) : (
					<div className="flex max-h-[min(60vh,28rem)] flex-col gap-3 overflow-y-auto pr-1">
						<div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background pb-2">
							<span className="text-xs text-muted-foreground">
								{available.length} available · {selectedCount} selected
								{isFetching ? " · Refreshing…" : ""}
							</span>
							<div className="flex gap-1">
								<Button
									variant="ghost"
									size="xs"
									onClick={() => toggleAll(true)}
								>
									Select all
								</Button>
								<Button
									variant="ghost"
									size="xs"
									onClick={() => toggleAll(false)}
									disabled={selectedCount === 0}
								>
									Clear
								</Button>
							</div>
						</div>
						{groupedZones.map(({ account, zones: accountZones }) => (
							<div key={account.id} className="flex flex-col gap-1">
								<div className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
									<span className="truncate">{account.name}</span>
									<span className="shrink-0 font-mono font-normal opacity-70">
										{account.id.slice(0, 8)}…
									</span>
								</div>
								{accountZones
									.sort((a, b) => a.name.localeCompare(b.name))
									.map((zone) => (
										<label
											key={zone.id}
											htmlFor={`zone-${zone.id}`}
											className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/40"
										>
											<Checkbox
												id={`zone-${zone.id}`}
												checked={!!selected[zone.id]}
												onCheckedChange={(checked) =>
													setSelected((current) => ({
														...current,
														[zone.id]: checked === true,
													}))
												}
											/>
											<div className="min-w-0 flex-1">
												<p className="truncate font-mono text-sm">
													{zone.name}
												</p>
												<p className="text-xs capitalize text-muted-foreground">
													{zone.status}
												</p>
											</div>
										</label>
									))}
							</div>
						))}
					</div>
				)}

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={addMut.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={submit}
						disabled={
							isPending ||
							isFetching ||
							!!zonesError ||
							selectedCount === 0 ||
							available.length === 0
						}
						isLoading={addMut.isPending}
					>
						Add {selectedCount || "selected"}{" "}
						{selectedCount === 1 ? "zone" : "zones"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
