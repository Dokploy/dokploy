import { useEffect, useState } from "react";
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

	if (isPending) return <LoadingState label="Reading SSH configuration..." />;
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
				title="SSH"
				description={`SSH daemon settings (port ${data.port}) and the keys allowed to log in as ${data.username}.`}
				onRefresh={() => refetch()}
				isRefreshing={isRefetching}
			/>

			{data.settings?.passwordAuthentication && (
				<AlertBlock type="warning">
					Password authentication is enabled, which makes the server a target
					for brute force attacks. Dokploy connects with an SSH key, so it is
					safe to disable it if you also log in with a key.
				</AlertBlock>
			)}

			<fieldset
				disabled={!canEdit}
				className="grid gap-5 rounded-lg border p-4"
			>
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-1">
						<Label htmlFor="ssh-password-auth">Password authentication</Label>
						<p className="text-sm text-muted-foreground">
							Allow logging in with a password instead of a key.
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
						<Label>Root login</Label>
						<p className="text-sm text-muted-foreground">
							{connectsAsRoot
								? "Dokploy connects as root, so root login can't be fully disabled."
								: "Whether root can log in over SSH."}
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
							<SelectItem value="prohibit-password">Key only</SelectItem>
							<SelectItem value="yes">Allowed</SelectItem>
							<SelectItem value="no" disabled={connectsAsRoot}>
								Disabled
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-1">
						<Label htmlFor="ssh-max-auth-tries">Max auth tries</Label>
						<p className="text-sm text-muted-foreground">
							Authentication attempts allowed per connection (1-10).
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
						title="Apply SSH settings"
						type="default"
						description="The SSH daemon will be reloaded with the new settings and existing sessions stay open. Dokploy then reconnects to verify it still has access; if it can't, the server restores the previous settings automatically within 60 seconds."
						disabled={updateSettings.isPending}
						onClick={async () => {
							try {
								await updateSettings.mutateAsync({
									serverId,
									passwordAuthentication,
									permitRootLogin,
									maxAuthTries,
								});
								toast.success("SSH settings applied");
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
							Apply settings
						</Button>
					</DialogAction>
				</div>
			</fieldset>

			<div className="space-y-2">
				<h4 className="text-sm font-semibold">
					Authorized keys for {data.username}
				</h4>
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Type</TableHead>
								<TableHead>Fingerprint</TableHead>
								<TableHead>Comment</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(data.authorizedKeys ?? []).length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={4}
										className="text-center text-muted-foreground"
									>
										No authorized keys found
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
												title="Remove authorized key"
												description={`Anyone using the key ${key.fingerprint} will no longer be able to log in as ${data.username}.`}
												onClick={async () => {
													try {
														await removeKey.mutateAsync({
															serverId,
															fingerprint: key.fingerprint,
														});
														toast.success("Key removed");
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
													Remove
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
