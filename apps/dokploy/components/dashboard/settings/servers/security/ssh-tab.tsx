import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
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
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { ErrorState, LoadingState, SectionHeader } from "./section-header";

type PermitRootLogin = "yes" | "prohibit-password" | "no";

interface Props {
	serverId: string;
	canEdit: boolean;
}

export const SshTab = ({ serverId, canEdit }: Props) => {
	const { t } = useTranslation();
	const { data, isPending, isError, error, refetch, isRefetching } =
		api.serverSecurity.sshSecurity.useQuery({ serverId }, { retry: false });
	const updateSettings = api.serverSecurity.updateSshSettings.useMutation();
	const removeKey = api.serverSecurity.removeAuthorizedKey.useMutation();

	const [passwordAuthentication, setPasswordAuthentication] = useState(false);
	const [permitRootLogin, setPermitRootLogin] =
		useState<PermitRootLogin>("prohibit-password");
	const [maxAuthTries, setMaxAuthTries] = useState(3);

	useEffect(() => {
		if (!data) return;
		setPasswordAuthentication(data.settings?.passwordAuthentication);
		setPermitRootLogin(data.settings?.permitRootLogin);
		setMaxAuthTries(data.settings?.maxAuthTries);
	}, [data]);

	if (isPending)
		return <LoadingState label={t("settings.servers.security.ssh.reading")} />;
	if (isError)
		return (
			<ErrorState
				message={error.message}
				onRetry={() => refetch()}
				isRetrying={isRefetching}
			/>
		);

	const connectsAsRoot = data.username === "root";
	const isDirty =
		passwordAuthentication !== data.settings?.passwordAuthentication ||
		permitRootLogin !== data.settings?.permitRootLogin ||
		maxAuthTries !== data.settings?.maxAuthTries;
	const maxAuthTriesValid = maxAuthTries >= 1 && maxAuthTries <= 10;

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title={t("settings.servers.security.ssh.title")}
				description={t("settings.servers.security.ssh.description", {
					port: data.port,
					username: data.username,
				})}
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>

			{data.settings?.passwordAuthentication && (
				<AlertBlock type="warning">
					{t("settings.servers.security.ssh.passwordAuthWarning")}
				</AlertBlock>
			)}

			<fieldset
				disabled={!canEdit}
				className="grid gap-5 rounded-lg border p-4"
			>
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-1">
						<Label htmlFor="ssh-password-auth">
							{t("settings.servers.security.ssh.passwordAuth")}
						</Label>
						<p className="text-sm text-muted-foreground">
							{t("settings.servers.security.ssh.passwordAuthDescription")}
						</p>
					</div>
					<Switch
						id="ssh-password-auth"
						checked={passwordAuthentication}
						onCheckedChange={setPasswordAuthentication}
					/>
				</div>
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-1">
						<Label>{t("settings.servers.security.ssh.rootLogin")}</Label>
						<p className="text-sm text-muted-foreground">
							{connectsAsRoot
								? t("settings.servers.security.ssh.rootLoginConnectsAsRoot")
								: t("settings.servers.security.ssh.rootLoginDescription")}
						</p>
					</div>
					<Select
						value={permitRootLogin}
						onValueChange={(value) =>
							setPermitRootLogin(value as PermitRootLogin)
						}
					>
						<SelectTrigger className="w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="prohibit-password">
								{t("settings.servers.security.ssh.keyOnly")}
							</SelectItem>
							<SelectItem value="yes">
								{t("settings.servers.security.ssh.allowed")}
							</SelectItem>
							<SelectItem value="no" disabled={connectsAsRoot}>
								{t("settings.servers.security.ssh.disabled")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-1">
						<Label htmlFor="ssh-max-auth-tries">
							{t("settings.servers.security.ssh.maxAuthTries")}
						</Label>
						<p className="text-sm text-muted-foreground">
							{t("settings.servers.security.ssh.maxAuthTriesDescription")}
						</p>
					</div>
					<div className="w-56 shrink-0">
						<Input
							id="ssh-max-auth-tries"
							type="number"
							min={1}
							max={10}
							value={maxAuthTries}
							onChange={(e) => setMaxAuthTries(Number(e.target.value))}
						/>
					</div>
				</div>
				<div className="flex justify-end">
					<DialogAction
						title={t("settings.servers.security.ssh.applyTitle")}
						type="default"
						description={t("settings.servers.security.ssh.applyDescription")}
						disabled={updateSettings.isPending}
						onClick={async () => {
							try {
								await updateSettings.mutateAsync({
									serverId,
									passwordAuthentication,
									permitRootLogin,
									maxAuthTries,
								});
								toast.success(t("settings.servers.security.ssh.applied"));
								await refetch();
							} catch (err) {
								toast.error((err as Error).message);
							}
						}}
					>
						<Button
							disabled={!isDirty || !maxAuthTriesValid}
							isLoading={updateSettings.isPending}
						>
							{t("settings.servers.security.ssh.apply")}
						</Button>
					</DialogAction>
				</div>
			</fieldset>

			<div className="space-y-2">
				<h4 className="text-sm font-semibold">
					{t("settings.servers.security.ssh.authorizedKeys", {
						username: data.username,
					})}
				</h4>
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									{t("settings.servers.security.ssh.keyType")}
								</TableHead>
								<TableHead>
									{t("settings.servers.security.ssh.fingerprint")}
								</TableHead>
								<TableHead>
									{t("settings.servers.security.ssh.comment")}
								</TableHead>
								<TableHead className="text-right">
									{t("settings.servers.security.ssh.actions")}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(data.authorizedKeys ?? []).length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={4}
										className="text-center text-muted-foreground"
									>
										{t("settings.servers.security.ssh.noKeys")}
									</TableCell>
								</TableRow>
							) : (
								(data.authorizedKeys ?? []).map((key) => (
									<TableRow key={`${key.line}-${key.fingerprint}`}>
										<TableCell>
											{key.type}
											<span className="text-xs text-muted-foreground">
												{" "}
												{key.bits}
											</span>
										</TableCell>
										<TableCell className="font-mono text-xs break-all">
											{key.fingerprint}
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<span className="truncate max-w-48">
													{key.comment || "-"}
												</span>
												{key.usedByDokploy && (
													<Badge variant="blue">Dokploy</Badge>
												)}
											</div>
										</TableCell>
										<TableCell className="text-right">
											<DialogAction
												title={t(
													"settings.servers.security.ssh.removeKeyTitle",
												)}
												description={t(
													"settings.servers.security.ssh.removeKeyDescription",
													{
														fingerprint: key.fingerprint,
														username: data.username,
													},
												)}
												onClick={async () => {
													try {
														await removeKey.mutateAsync({
															serverId,
															fingerprint: key.fingerprint,
														});
														toast.success(
															t("settings.servers.security.ssh.keyRemoved"),
														);
														await refetch();
													} catch (err) {
														toast.error((err as Error).message);
													}
												}}
											>
												<Button
													variant="ghost"
													size="sm"
													className="text-destructive"
													disabled={
														!canEdit || key.usedByDokploy || removeKey.isPending
													}
												>
													{t("settings.servers.security.ssh.remove")}
												</Button>
											</DialogAction>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
};
