import { Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { StatusRow } from "./gpu-support";

interface Props {
	serverId: string;
}

export const SecurityAudit = ({ serverId }: Props) => {
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { t } = useTranslation("settings");
	const { data, refetch, error, isLoading, isError } =
		api.server.security.useQuery(
			{ serverId },
			{
				enabled: !!serverId,
			},
		);

	return (
		<CardContent className="p-0">
			<div className="flex flex-col gap-4">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
						<div className="flex flex-row gap-2 justify-between w-full  max-sm:flex-col">
							<div className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<LockKeyhole className="size-5" />
									<CardTitle className="text-xl">
										{t("settings.servers.security.card.title")}
									</CardTitle>
								</div>
								<CardDescription>
									{t("settings.servers.security.card.description")}
								</CardDescription>
							</div>
							<Button
								isLoading={isRefreshing}
								onClick={async () => {
									setIsRefreshing(true);
									await refetch();
									setIsRefreshing(false);
								}}
							>
								<RefreshCw className="size-4" />
								{t("settings.servers.onboarding.verify.refreshButton")}
							</Button>
						</div>
						<div className="flex items-center gap-2 w-full">
							{isError && (
								<AlertBlock type="error" className="w-full">
									{error.message}
								</AlertBlock>
							)}
						</div>
					</CardHeader>

					<CardContent className="flex flex-col gap-4">
						<AlertBlock type="info" className="w-full">
							{t("settings.servers.security.alert.experimental")}
						</AlertBlock>
						{isLoading ? (
							<div className="flex items-center justify-center text-muted-foreground py-4">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>
									{t("settings.servers.onboarding.verify.loading")}
								</span>
							</div>
						) : (
							<div className="grid w-full gap-4">
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.servers.security.ufw.title")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.servers.security.ufw.description")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t(
												"settings.servers.security.ufw.installed.label",
											)}
											isEnabled={data?.ufw?.installed}
											description={
												data?.ufw?.installed
													? t(
														"settings.servers.security.ufw.installed.installed",
													)
													: t(
														"settings.servers.security.ufw.installed.notInstalled",
													)
											}
										/>
										<StatusRow
											label={t("settings.servers.security.ufw.status.label")}
											isEnabled={data?.ufw?.active}
											description={
												data?.ufw?.active
													? t("settings.servers.security.ufw.status.active")
													: t("settings.servers.security.ufw.status.inactive")
											}
										/>
										<StatusRow
											label={t(
												"settings.servers.security.ufw.defaultIncoming.label",
											)}
											isEnabled={data?.ufw?.defaultIncoming === "deny"}
											description={
												data?.ufw?.defaultIncoming === "deny"
													? t("settings.servers.security.ufw.defaultIncoming.deny")
													: t(
														"settings.servers.security.ufw.defaultIncoming.other",
														{
															policy: data?.ufw?.defaultIncoming,
														},
													)
											}
										/>
									</div>
								</div>

								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.servers.security.ssh.title")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.servers.security.ssh.description")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t("settings.servers.security.ssh.enabled.label")}
											isEnabled={data?.ssh?.enabled}
											description={
												data?.ssh?.enabled
													? t("settings.servers.security.ssh.enabled.enabled")
													: t("settings.servers.security.ssh.enabled.disabled")
											}
										/>
										<StatusRow
											label={t("settings.servers.security.ssh.keyAuth.label")}
											isEnabled={data?.ssh?.keyAuth}
											description={
												data?.ssh?.keyAuth
													? t("settings.servers.security.ssh.keyAuth.enabled")
													: t("settings.servers.security.ssh.keyAuth.disabled")
											}
										/>
										<StatusRow
											label={t("settings.servers.security.ssh.passwordAuth.label")}
											isEnabled={data?.ssh?.passwordAuth === "no"}
											description={
												data?.ssh?.passwordAuth === "no"
													? t(
														"settings.servers.security.ssh.passwordAuth.disabled",
													)
													: t(
														"settings.servers.security.ssh.passwordAuth.enabled",
													)
											}
										/>
										<StatusRow
											label={t("settings.servers.security.ssh.usePam.label")}
											isEnabled={data?.ssh?.usePam === "no"}
											description={
												data?.ssh?.usePam === "no"
													? t(
														"settings.servers.security.ssh.usePam.disabled",
													)
													: t(
														"settings.servers.security.ssh.usePam.enabled",
													)
											}
										/>
									</div>
								</div>

								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.servers.security.fail2ban.title")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.servers.security.fail2ban.description")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t(
												"settings.servers.security.fail2ban.installed.label",
											)}
											isEnabled={data?.fail2ban?.installed}
											description={
												data?.fail2ban?.installed
													? t(
														"settings.servers.security.fail2ban.installed.installed",
													)
													: t(
														"settings.servers.security.fail2ban.installed.notInstalled",
													)
											}
										/>

										<StatusRow
											label={t("settings.servers.security.fail2ban.enabled.label")}
											isEnabled={data?.fail2ban?.enabled}
											description={
												data?.fail2ban?.enabled
													? t("settings.servers.security.fail2ban.enabled.enabled")
													: t(
														"settings.servers.security.fail2ban.enabled.disabled",
													)
											}
										/>
										<StatusRow
											label={t("settings.servers.security.fail2ban.active.label")}
											isEnabled={data?.fail2ban?.active}
											description={
												data?.fail2ban?.active
													? t("settings.servers.security.fail2ban.active.active")
													: t(
														"settings.servers.security.fail2ban.active.inactive",
													)
											}
										/>

										<StatusRow
											label={t(
												"settings.servers.security.fail2ban.sshProtection.label",
											)}
											isEnabled={data?.fail2ban?.sshEnabled === "true"}
											description={
												data?.fail2ban?.sshEnabled === "true"
													? t(
														"settings.servers.security.fail2ban.sshProtection.enabled",
													)
													: t(
														"settings.servers.security.fail2ban.sshProtection.disabled",
													)
											}
										/>

										<StatusRow
											label={t("settings.servers.security.fail2ban.sshMode.label")}
											isEnabled={data?.fail2ban?.sshMode === "aggressive"}
											description={
												data?.fail2ban?.sshMode === "aggressive"
													? t("settings.servers.security.fail2ban.sshMode.aggressive")
													: t(
														"settings.servers.security.fail2ban.sshMode.other",
														{
															mode: data?.fail2ban?.sshMode || "Not Set",
														},
													)
											}
										/>
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</CardContent>
	);
};
