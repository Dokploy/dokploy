import { Globe2, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api, type RouterOutputs } from "@/utils/api";
import { AddZoneDialog } from "./add-zone-dialog";

type ConfigData = RouterOutputs["cloudflare"]["getConfig"];
type Zone = ConfigData["zones"][number];

interface Props {
	zones: ConfigData["zones"];
	accounts: NonNullable<ConfigData["config"]>["accounts"];
	canUpdate: boolean;
}

export const CloudflareZoneList = ({ zones, accounts, canUpdate }: Props) => {
	const utils = api.useUtils();
	const [addOpen, setAddOpen] = useState(false);

	const invalidateZoneDependencies = async () => {
		await Promise.all([
			utils.cloudflare.getConfig.invalidate(),
			utils.cloudflare.listAvailableZones.invalidate(),
			utils.cloudflare.getLocalTunnelAccountChoice.invalidate(),
			utils.cloudflare.getServerTunnelAccountChoice.invalidate(),
		]);
	};

	const toggleMut = api.cloudflare.toggleZone.useMutation({
		onSuccess: async (_data, variables) => {
			toast.success(variables.enabled ? "Zone enabled" : "Zone disabled");
			await invalidateZoneDependencies();
		},
		onError: (error) => toast.error(error.message),
	});
	const removeMut = api.cloudflare.removeZone.useMutation({
		onSuccess: async () => {
			toast.success("Zone removed");
			await invalidateZoneDependencies();
		},
		onError: (error) => toast.error(error.message),
	});
	const testMut = api.cloudflare.testZone.useMutation({
		onSuccess: (result) =>
			toast.success(`Zone is reachable · ${result.recordCount} DNS records`),
		onError: (error) => toast.error(error.message),
	});

	const sortedZones = [...zones].sort((a, b) =>
		a.zoneName.localeCompare(b.zoneName),
	);
	const accountNames = new Map(
		accounts.map((account) => [account.id, account.name]),
	);
	const togglingId = toggleMut.isPending
		? toggleMut.variables?.cloudflareZoneId
		: null;
	const testingId = testMut.isPending
		? testMut.variables?.cloudflareZoneId
		: null;
	const removingId = removeMut.isPending
		? removeMut.variables?.cloudflareZoneId
		: null;

	const renderStatus = (zone: Zone) => (
		<Badge
			variant={zone.status === "active" ? "default" : "secondary"}
			className="capitalize"
		>
			{zone.status ?? "unknown"}
		</Badge>
	);

	const renderToggle = (zone: Zone) => (
		<div className="flex items-center gap-2">
			<Switch
				checked={zone.enabled}
				disabled={!canUpdate || toggleMut.isPending}
				onCheckedChange={(enabled) =>
					toggleMut.mutate({
						cloudflareZoneId: zone.cloudflareZoneId,
						enabled,
					})
				}
				aria-label={`${zone.enabled ? "Disable" : "Enable"} ${zone.zoneName}`}
			/>
			<span className="text-xs text-muted-foreground">
				{togglingId === zone.cloudflareZoneId ? (
					<Loader2 className="size-3.5 animate-spin" />
				) : zone.enabled ? (
					"Enabled"
				) : (
					"Disabled"
				)}
			</span>
		</div>
	);

	const renderActions = (zone: Zone) => (
		<div className="flex flex-nowrap justify-end gap-2">
			<Button
				variant="outline"
				size="sm"
				onClick={() =>
					testMut.mutate({ cloudflareZoneId: zone.cloudflareZoneId })
				}
				disabled={testMut.isPending || removeMut.isPending}
				isLoading={testingId === zone.cloudflareZoneId}
			>
				Test
			</Button>
			{canUpdate ? (
				<DialogAction
					title={`Remove ${zone.zoneName}?`}
					description="Dokploy will stop offering this zone for new domains. Existing DNS records in Cloudflare are not deleted, but domains linked to this zone will no longer be managed."
					onClick={() =>
						removeMut.mutate({ cloudflareZoneId: zone.cloudflareZoneId })
					}
					disabled={removeMut.isPending}
				>
					<Button
						variant="destructive"
						size="icon-sm"
						disabled={removeMut.isPending || testMut.isPending}
						isLoading={removingId === zone.cloudflareZoneId}
						aria-label={`Remove ${zone.zoneName}`}
					>
						{removingId !== zone.cloudflareZoneId ? (
							<Trash2 className="size-4" />
						) : null}
					</Button>
				</DialogAction>
			) : null}
		</div>
	);

	return (
		<Card>
			<CardHeader className="has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
				<CardTitle className="flex items-center gap-2">
					<Globe2 className="size-5 text-muted-foreground" />
					Managed zones
				</CardTitle>
				<CardDescription>
					Choose which Cloudflare zones can be attached to Dokploy domains.
					Disabling a zone keeps its configuration but hides it from new domain
					forms.
				</CardDescription>
				{canUpdate && zones.length > 0 ? (
					<CardAction className="col-start-1 row-start-3 mt-2 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:justify-self-end">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setAddOpen(true)}
						>
							<Plus className="size-4" />
							Add zones
						</Button>
					</CardAction>
				) : null}
			</CardHeader>
			<CardContent>
				{zones.length === 0 ? (
					<div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
						<div className="rounded-full bg-muted p-3">
							<Globe2 className="size-6 text-muted-foreground" />
						</div>
						<div>
							<p className="text-sm font-medium">No managed zones yet</p>
							<p className="mt-1 max-w-md text-xs text-muted-foreground">
								Add at least one zone before assigning Cloudflare-managed
								domains to services.
							</p>
						</div>
						{canUpdate ? (
							<Button size="sm" onClick={() => setAddOpen(true)}>
								<Plus className="size-4" />
								Add your first zone
							</Button>
						) : null}
					</div>
				) : (
					<>
						<div className="grid min-w-0 gap-3 md:hidden">
							{sortedZones.map((zone) => (
								<div
									key={zone.cloudflareZoneId}
									className="w-full min-w-0 space-y-4 overflow-hidden rounded-lg border p-4"
								>
									<div className="flex min-w-0 items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate font-mono text-sm font-medium">
												{zone.zoneName}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{accountNames.get(zone.accountId) ?? "Unknown account"}
											</p>
										</div>
										{renderStatus(zone)}
									</div>
									<div className="flex items-center justify-between gap-3 border-t pt-3">
										{renderToggle(zone)}
										{renderActions(zone)}
									</div>
								</div>
							))}
						</div>
						<div className="hidden md:block">
							<Table className="min-w-[760px] table-fixed">
								<TableHeader>
									<TableRow>
										<TableHead className="w-[38%]">Zone</TableHead>
										<TableHead className="w-[24%]">Account</TableHead>
										<TableHead className="w-[100px]">Status</TableHead>
										<TableHead className="w-[145px]">Availability</TableHead>
										<TableHead className="w-[120px] text-right">
											Actions
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedZones.map((zone) => (
										<TableRow key={zone.cloudflareZoneId}>
											<TableCell className="font-mono font-medium">
												<div className="truncate" title={zone.zoneName}>
													{zone.zoneName}
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground">
												<div
													className="truncate"
													title={accountNames.get(zone.accountId)}
												>
													{accountNames.get(zone.accountId) ?? zone.accountId}
												</div>
											</TableCell>
											<TableCell>{renderStatus(zone)}</TableCell>
											<TableCell>{renderToggle(zone)}</TableCell>
											<TableCell>{renderActions(zone)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</>
				)}
			</CardContent>
			<AddZoneDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				existingZoneIds={zones.map((zone) => zone.zoneId)}
			/>
		</Card>
	);
};
