import { AlertCircle, Check, Cloud, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { useDebounce } from "@/utils/hooks/use-debounce";

const RESERVED_NAMES = new Set(["dokploy", "traefik"]);

const isValidLabel = (label: string) => {
	if (label.length === 0) return true; // apex
	if (label.length > 63) return false;
	return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label);
};

interface Props {
	cloudflareZoneId: string | null | undefined;
	host: string;
	onChange: (next: { cloudflareZoneId: string | null; host: string }) => void;
	disabled?: boolean;
}

export const CloudflareDomainFields = ({
	cloudflareZoneId,
	host,
	onChange,
	disabled,
}: Props) => {
	const { data, isLoading } = api.cloudflare.getConfig.useQuery();
	const enabledZones = (data?.zones ?? []).filter((z) => z.enabled);

	const [mode, setMode] = useState<"manual" | "cloudflare">(
		cloudflareZoneId ? "cloudflare" : "manual",
	);
	const selectedZone = enabledZones.find(
		(z) => z.cloudflareZoneId === cloudflareZoneId,
	);

	const [zoneId, setZoneId] = useState<string>(
		cloudflareZoneId ?? enabledZones[0]?.cloudflareZoneId ?? "",
	);
	const activeZone = enabledZones.find((z) => z.cloudflareZoneId === zoneId);
	const initialSub =
		selectedZone && host
			? host === selectedZone.zoneName
				? ""
				: host.replace(`.${selectedZone.zoneName}`, "")
			: "";
	const [subdomain, setSubdomain] = useState<string>(initialSub);
	const debouncedSub = useDebounce(subdomain, 300);

	const fullHost =
		activeZone &&
		(debouncedSub.trim() === ""
			? activeZone.zoneName
			: `${debouncedSub.trim()}.${activeZone.zoneName}`);

	useEffect(() => {
		if (mode === "cloudflare" && activeZone && fullHost) {
			onChange({
				cloudflareZoneId: activeZone.cloudflareZoneId,
				host: fullHost,
			});
		}
		if (mode === "manual" && cloudflareZoneId) {
			onChange({ cloudflareZoneId: null, host });
		}
	}, [mode, fullHost, activeZone?.cloudflareZoneId]);

	const labelValid = isValidLabel(subdomain.trim());
	const isReserved = RESERVED_NAMES.has(subdomain.trim().toLowerCase());

	const { data: availability, isFetching } =
		api.cloudflare.checkSubdomainAvailability.useQuery(
			{
				cloudflareZoneId: zoneId,
				subdomain: debouncedSub.trim(),
			},
			{
				enabled: mode === "cloudflare" && !!zoneId && labelValid && !isReserved,
			},
		);

	if (isLoading) return null;
	if (enabledZones.length === 0) return null;

	return (
		<div className="rounded-md border bg-muted/30 p-3 flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<Cloud className="h-4 w-4 text-muted-foreground" />
				<Label className="text-sm font-medium">DNS Source</Label>
			</div>
			<div className="flex gap-2">
				<Button
					type="button"
					variant={mode === "manual" ? "default" : "outline"}
					size="sm"
					onClick={() => setMode("manual")}
					disabled={disabled}
				>
					Manual / traefik.me
				</Button>
				<Button
					type="button"
					variant={mode === "cloudflare" ? "default" : "outline"}
					size="sm"
					onClick={() => setMode("cloudflare")}
					disabled={disabled}
				>
					Cloudflare-managed
				</Button>
			</div>

			{mode === "cloudflare" ? (
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs">Zone</Label>
						<Select
							value={zoneId}
							onValueChange={setZoneId}
							disabled={disabled}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{enabledZones.map((z) => (
									<SelectItem
										key={z.cloudflareZoneId}
										value={z.cloudflareZoneId}
									>
										{z.zoneName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs">Subdomain</Label>
						<div className="flex items-center gap-2">
							<Input
								placeholder="app"
								value={subdomain}
								onChange={(e) => setSubdomain(e.target.value)}
								disabled={disabled}
								className="flex-1"
							/>
							<span className="text-sm text-muted-foreground font-mono">
								.{activeZone?.zoneName}
							</span>
						</div>
						{subdomain.trim() === "" && (
							<p className="text-xs text-amber-600">
								Apex selected · {activeZone?.zoneName} will be used
							</p>
						)}
						{!labelValid && (
							<p className="text-xs text-destructive flex items-center gap-1">
								<AlertCircle className="h-3 w-3" />
								Invalid hostname (RFC 1123, ≤63 chars)
							</p>
						)}
						{isReserved && (
							<p className="text-xs text-destructive flex items-center gap-1">
								<AlertCircle className="h-3 w-3" />
								Reserved name
							</p>
						)}
						{labelValid && !isReserved && (
							<div className="text-xs flex items-center gap-2 min-h-4">
								{isFetching ? (
									<>
										<Loader2 className="h-3 w-3 animate-spin" />
										<span className="text-muted-foreground">Checking...</span>
									</>
								) : availability?.cloudflareConflict ? (
									<>
										<AlertCircle className="h-3 w-3 text-amber-600" />
										<span className="text-amber-600">
											Existing {availability.existingType} record on this name.
											{availability.comment?.includes("Dokploy")
												? " (Owned by Dokploy)"
												: " Override at your own risk."}
										</span>
									</>
								) : availability ? (
									<>
										<Check className="h-3 w-3 text-green-600" />
										<span className="text-green-600">
											{availability.host} is available
										</span>
									</>
								) : null}
							</div>
						)}
					</div>
				</div>
			) : null}
			{mode === "cloudflare" && fullHost ? (
				<div className="flex items-center gap-2 text-sm">
					<Badge variant="secondary">Effective host</Badge>
					<code className="font-mono">{fullHost}</code>
				</div>
			) : null}
		</div>
	);
};
