import { Ban, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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
			? t("settings.servers.security.bannedIps.errors.invalidIp")
			: panelIps.includes(trimmedIp)
				? t("settings.servers.security.bannedIps.errors.panelIp")
				: null;

	const handleBan = async () => {
		try {
			await banIp.mutateAsync({ serverId, ip: trimmedIp });
			toast.success(
				t("settings.servers.security.bannedIps.bannedPermanently", {
					ip: trimmedIp,
				}),
			);
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
						{t("settings.servers.security.bannedIps.title")}{" "}
						<span className="text-muted-foreground">({bans.length})</span>
					</h4>
					<p className="text-sm text-muted-foreground">
						{t("settings.servers.security.bannedIps.description")}
					</p>
				</div>
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<Input
							placeholder={t(
								"settings.servers.security.bannedIps.banPlaceholder",
							)}
							className="w-64 font-mono text-sm"
							value={ipToBan}
							disabled={!canEdit || !canBanManually}
							onChange={(e) => setIpToBan(e.target.value)}
						/>
						<DialogAction
							title={t("settings.servers.security.bannedIps.banTitle")}
							description={t("settings.servers.security.bannedIps.banDescription", {
								ip: trimmedIp,
							})}
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
								{t("settings.servers.security.bannedIps.banIp")}
							</Button>
						</DialogAction>
					</div>
					{ipError && <p className="text-xs text-destructive">{ipError}</p>}
						{!canBanManually && (
							<p className="text-xs text-muted-foreground">
								{t("settings.servers.security.bannedIps.saveToEnable")}
							</p>
						)}
				</div>
			</div>

			{bans.length > 0 && (
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder={t(
								"settings.servers.security.bannedIps.searchPlaceholder",
							)}
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
								<TableHead>
									{t("settings.servers.security.bannedIps.ipAddress")}
								</TableHead>
								<TableHead>
									{t("settings.servers.security.bannedIps.source")}
								</TableHead>
								<TableHead>
									{t("settings.servers.security.bannedIps.bannedAt")}
								</TableHead>
								<TableHead>
									{t("settings.servers.security.bannedIps.expires")}
								</TableHead>
								<TableHead className="text-right">
									{t("settings.servers.security.bannedIps.actions")}
								</TableHead>
							</TableRow>
					</TableHeader>
					<TableBody>
						{filtered.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-center text-muted-foreground"
								>
									{bans.length === 0
										? t("settings.servers.security.bannedIps.noBannedIps")
										: t("settings.servers.security.bannedIps.noMatches")}
								</TableCell>
							</TableRow>
						) : (
							filtered.map((ban) => (
								<TableRow key={`${ban.jail}-${ban.ip}`}>
									<TableCell className="font-mono text-xs">{ban.ip}</TableCell>
									<TableCell>
										{ban.jail === MANUAL_JAIL ? (
											<Badge variant="blue">
												{t("settings.servers.security.bannedIps.manual")}
											</Badge>
										) : (
											<Badge variant="blank">{ban.jail}</Badge>
										)}
									</TableCell>
									<TableCell className="text-xs">
										{ban.bannedAt ?? "-"}
									</TableCell>
									<TableCell className="text-xs">
										{ban.permanent ? (
											<Badge variant="red">
												{t("settings.servers.security.bannedIps.permanent")}
											</Badge>
										) : (
											(ban.expiresAt ?? "-")
										)}
									</TableCell>
									<TableCell className="text-right">
											<DialogAction
												title={t("settings.servers.security.bannedIps.unbanTitle")}
												description={t(
													"settings.servers.security.bannedIps.unbanDescription",
													{ ip: ban.ip, jail: ban.jail },
												)}
											type="default"
											onClick={async () => {
												try {
													await unbanIp.mutateAsync({
														serverId,
														jail: ban.jail,
														ip: ban.ip,
													});
													toast.success(
														t("settings.servers.security.bannedIps.unbanned", {
															ip: ban.ip,
														}),
													);
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
												{t("settings.servers.security.bannedIps.unban")}
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
				{t("settings.servers.security.bannedIps.timezoneNote")}
			</p>
		</div>
	);
};
