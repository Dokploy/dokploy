import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { AddZoneDialog } from "./add-zone-dialog";

export const CloudflareZoneList = () => {
	const utils = api.useUtils();
	const { data, isLoading } = api.cloudflare.getConfig.useQuery();
	const [addOpen, setAddOpen] = useState(false);

	const toggleMut = api.cloudflare.toggleZone.useMutation({
		onSuccess: (_data, variables) => {
			toast.success(variables.enabled ? "Zone enabled" : "Zone disabled");
			utils.cloudflare.getConfig.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});
	const removeMut = api.cloudflare.removeZone.useMutation({
		onSuccess: () => {
			toast.success("Zone removed");
			utils.cloudflare.getConfig.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});
	const testMut = api.cloudflare.testZone.useMutation({
		onSuccess: (r) => toast.success(`Zone OK · ${r.recordCount} records`),
		onError: (e) => toast.error(e.message),
	});

	const zones = data?.zones ?? [];
	const hasConfig = !!data?.config;

	if (!hasConfig) {
		return null;
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-3">
				<div>
					<CardTitle>Zones</CardTitle>
					<CardDescription>
						Domains you'll route traffic to via Dokploy. Only zones added here
						are selectable when adding a Domain to a service.
					</CardDescription>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setAddOpen(true)}
					disabled={!hasConfig}
				>
					<Plus className="h-4 w-4" />
					Add Zone
				</Button>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex items-center gap-2 text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading...
					</div>
				) : zones.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No zones configured yet.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Zone</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Enabled</TableHead>
								<TableHead className="w-[200px] text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{zones.map((z) => (
								<TableRow key={z.cloudflareZoneId}>
									<TableCell className="font-mono">{z.zoneName}</TableCell>
									<TableCell>
										<Badge
											variant={z.status === "active" ? "default" : "secondary"}
										>
											{z.status ?? "unknown"}
										</Badge>
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="sm"
											disabled={toggleMut.isPending}
											onClick={() =>
												toggleMut.mutate({
													cloudflareZoneId: z.cloudflareZoneId,
													enabled: !z.enabled,
												})
											}
										>
											{z.enabled ? "On" : "Off"}
										</Button>
									</TableCell>
									<TableCell className="flex justify-end gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												testMut.mutate({
													cloudflareZoneId: z.cloudflareZoneId,
												})
											}
											disabled={testMut.isPending}
										>
											Test
										</Button>
										<DialogAction
											title="Remove zone?"
											description="Existing CF-managed domains using this zone won't be deleted, but their record IDs will become orphaned."
											onClick={() =>
												removeMut.mutate({
													cloudflareZoneId: z.cloudflareZoneId,
												})
											}
										>
											<Button variant="destructive" size="sm">
												<Trash2 className="h-4 w-4" />
											</Button>
										</DialogAction>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
			<AddZoneDialog open={addOpen} onOpenChange={setAddOpen} />
		</Card>
	);
};
