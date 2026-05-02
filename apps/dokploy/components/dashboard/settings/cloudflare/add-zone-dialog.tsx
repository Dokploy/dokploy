import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
}

export const AddZoneDialog = ({ open, onOpenChange }: Props) => {
	const utils = api.useUtils();
	const {
		data: zones,
		isFetching,
		error: zonesError,
	} = api.cloudflare.listAvailableZones.useQuery(undefined, { enabled: open });
	const { data: configData } = api.cloudflare.getConfig.useQuery();
	const [selected, setSelected] = useState<Record<string, boolean>>({});

	useEffect(() => {
		if (!open) setSelected({});
	}, [open]);

	const addMut = api.cloudflare.addZones.useMutation({
		onSuccess: () => {
			toast.success("Zones added");
			utils.cloudflare.getConfig.invalidate();
			onOpenChange(false);
		},
		onError: (e) => toast.error(e.message),
	});

	const existingIds = new Set((configData?.zones ?? []).map((z) => z.zoneId));
	const available = (zones ?? []).filter((z) => !existingIds.has(z.id));

	const toggleAll = (next: boolean) => {
		const map: Record<string, boolean> = {};
		for (const z of available) map[z.id] = next;
		setSelected(map);
	};

	const submit = () => {
		const picked = available.filter((z) => selected[z.id]);
		if (picked.length === 0) return;
		addMut.mutate({
			zones: picked.map((z) => ({
				zoneId: z.id,
				zoneName: z.name,
				accountId: z.account.id,
				status: z.status,
			})),
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Cloudflare Zones</DialogTitle>
					<DialogDescription>
						Pick the zones you want Dokploy to manage. You can add or remove
						zones later.
					</DialogDescription>
				</DialogHeader>

				{isFetching ? (
					<div className="flex items-center gap-2 text-muted-foreground py-6">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading zones...
					</div>
				) : zonesError ? (
					<AlertBlock type="error">
						Couldn't load zones from Cloudflare: {zonesError.message}
					</AlertBlock>
				) : available.length === 0 ? (
					<p className="text-sm text-muted-foreground py-6">
						No new zones available — every zone on this account is already
						configured.
					</p>
				) : (
					<div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
						<div className="flex items-center justify-between border-b pb-2">
							<span className="text-xs text-muted-foreground">
								{available.length} available
							</span>
							<div className="flex gap-2">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => toggleAll(true)}
								>
									Select all
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => toggleAll(false)}
								>
									Clear
								</Button>
							</div>
						</div>
						{available.map((z) => (
							<label
								key={z.id}
								htmlFor={`zone-${z.id}`}
								className="flex items-center gap-3 px-2 py-2 rounded hover:bg-muted/40 cursor-pointer text-left"
							>
								<Checkbox
									id={`zone-${z.id}`}
									checked={!!selected[z.id]}
									onCheckedChange={(v) =>
										setSelected((prev) => ({ ...prev, [z.id]: !!v }))
									}
								/>
								<div className="flex flex-col flex-1">
									<span className="font-mono text-sm">{z.name}</span>
									<span className="text-xs text-muted-foreground">
										{z.account.name} · {z.status}
									</span>
								</div>
							</label>
						))}
					</div>
				)}

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={submit}
						disabled={
							addMut.isPending ||
							isFetching ||
							!!zonesError ||
							Object.values(selected).every((v) => !v) ||
							available.length === 0
						}
					>
						{addMut.isPending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : null}
						Add Zones
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
