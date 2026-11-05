import { Ban, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";

const MANUAL_JAIL = "dokploy-manual";
const ipSchema = z.union([z.ipv4(), z.ipv6()]);

interface Ban {
	ip: string;
	jail: string;
	bannedAt: string | null;
	expiresAt: string | null;
	permanent: boolean;
}

interface Props {
	serverId: string;
	bans: Ban[];
	panelIps: string[];
	canBanManually: boolean;
	canEdit: boolean;
	onChange: () => Promise<unknown>;
}

export const BannedIps = ({
	serverId,
	bans,
	panelIps,
	canBanManually,
	canEdit,
	onChange,
}: Props) => {
	const [search, setSearch] = useState("");
	const [ipToBan, setIpToBan] = useState("");
	const banIp = api.serverSecurity.banIp.useMutation();
	const unbanIp = api.serverSecurity.unbanIp.useMutation();

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		const sorted = [...bans].sort((a, b) =>
			(b.bannedAt ?? "").localeCompare(a.bannedAt ?? ""),
		);
		return term
			? sorted.filter((ban) => ban.ip.includes(term) || ban.jail.includes(term))
			: sorted;
	}, [bans, search]);

	const trimmedIp = ipToBan.trim();
	const ipError = !trimmedIp
		? null
		: !ipSchema.safeParse(trimmedIp).success
			? "Enter a valid IPv4 or IPv6 address"
			: panelIps.includes(trimmedIp)
				? "This is the Dokploy panel IP"
				: null;

	const handleBan = async () => {
		try {
			await banIp.mutateAsync({ serverId, ip: trimmedIp });
			toast.success(`${trimmedIp} banned permanently`);
			setIpToBan("");
			await onChange();
		} catch (err) {
			toast.error((err as Error).message);
		}
	};

	return (
		<div className="flex flex-col gap-3 rounded-lg border p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h4 className="text-sm font-semibold">
						Banned IPs{" "}
						<span className="text-muted-foreground">({bans.length})</span>
					</h4>
					<p className="text-sm text-muted-foreground">
						IPs banned manually are blocked on every port until you unban them.
					</p>
				</div>
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<Input
							placeholder="IP to ban, e.g. 203.0.113.10"
							className="w-64 font-mono text-sm"
							value={ipToBan}
							disabled={!canEdit || !canBanManually}
							onChange={(e) => setIpToBan(e.target.value)}
						/>
						<DialogAction
							title="Ban IP permanently"
							description={`${trimmedIp} will be blocked on every port of this server until you unban it.`}
							onClick={handleBan}
						>
							<Button
								variant="destructive"
								disabled={
									!canEdit || !trimmedIp || !!ipError || !canBanManually
								}
								isLoading={banIp.isPending}
							>
								<Ban className="size-4" />
								Ban IP
							</Button>
						</DialogAction>
					</div>
					{ipError && <p className="text-xs text-destructive">{ipError}</p>}
					{!canBanManually && (
						<p className="text-xs text-muted-foreground">
							Click "Save configuration" above to enable manual bans.
						</p>
					)}
				</div>
			</div>

			{bans.length > 0 && (
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search by IP or jail"
						className="pl-9"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
			)}

			<div className="max-h-96 overflow-y-auto rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>IP address</TableHead>
							<TableHead>Source</TableHead>
							<TableHead>Banned at</TableHead>
							<TableHead>Expires</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filtered.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-center text-muted-foreground"
								>
									{bans.length === 0 ? "No banned IPs" : "No matches"}
								</TableCell>
							</TableRow>
						) : (
							filtered.map((ban) => (
								<TableRow key={`${ban.jail}-${ban.ip}`}>
									<TableCell className="font-mono text-xs">{ban.ip}</TableCell>
									<TableCell>
										{ban.jail === MANUAL_JAIL ? (
											<Badge variant="blue">Manual</Badge>
										) : (
											<Badge variant="blank">{ban.jail}</Badge>
										)}
									</TableCell>
									<TableCell className="text-xs">
										{ban.bannedAt ?? "-"}
									</TableCell>
									<TableCell className="text-xs">
										{ban.permanent ? (
											<Badge variant="red">Permanent</Badge>
										) : (
											(ban.expiresAt ?? "-")
										)}
									</TableCell>
									<TableCell className="text-right">
										<DialogAction
											title="Unban IP"
											description={`Remove ${ban.ip} from the ${ban.jail} jail?`}
											type="default"
											onClick={async () => {
												try {
													await unbanIp.mutateAsync({
														serverId,
														jail: ban.jail,
														ip: ban.ip,
													});
													toast.success(`${ban.ip} unbanned`);
													await onChange();
												} catch (err) {
													toast.error((err as Error).message);
												}
											}}
										>
											<Button
												variant="ghost"
												size="sm"
												disabled={!canEdit || unbanIp.isPending}
											>
												Unban
											</Button>
										</DialogAction>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
			<p className="text-xs text-muted-foreground">
				Times are shown in the server's timezone.
			</p>
		</div>
	);
};
