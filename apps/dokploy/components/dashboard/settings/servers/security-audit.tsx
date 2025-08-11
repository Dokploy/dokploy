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
import { Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { StatusRow } from "./gpu-support";

interface Props {
	serverId: string;
}

export const SecurityAudit = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const [isRefreshing, setIsRefreshing] = useState(false);
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
										{t("settings.securityAudit.setupSecuritySuggestions")}
									</CardTitle>
								</div>
								<CardDescription>
									{t("settings.securityAudit.checkSecuritySuggestions")}
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
								{t("settings.securityAudit.refresh")}
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
							{t("settings.securityAudit.ubuntuDebianSupport")}
						</AlertBlock>
						{isLoading ? (
							<div className="flex items-center justify-center text-muted-foreground py-4">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>
									{t("settings.securityAudit.checkingServerConfiguration")}
								</span>
							</div>
						) : (
							<div className="grid w-full gap-4">
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.securityAudit.ufw")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.securityAudit.ufwDescription")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t("settings.securityAudit.ufwInstalled")}
											isEnabled={data?.ufw?.installed}
											description={
												data?.ufw?.installed
													? t("settings.securityAudit.installedRecommended")
													: t("settings.securityAudit.notInstalledUfw")
											}
										/>
										<StatusRow
											label={t("settings.securityAudit.status")}
											isEnabled={data?.ufw?.active}
											description={
												data?.ufw?.active
													? t("settings.securityAudit.activeRecommended")
													: t("settings.securityAudit.notActiveUfw")
											}
										/>
										<StatusRow
											label={t("settings.securityAudit.defaultIncoming")}
											isEnabled={data?.ufw?.defaultIncoming === "deny"}
											description={
												data?.ufw?.defaultIncoming === "deny"
													? t("settings.securityAudit.defaultDenyRecommended")
													: t("settings.securityAudit.defaultShouldBeDeny", {
															value: data?.ufw?.defaultIncoming,
														})
											}
										/>
									</div>
								</div>

								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.securityAudit.ssh")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.securityAudit.sshDescription")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t("settings.securityAudit.enabled")}
											isEnabled={data?.ssh?.enabled}
											description={
												data?.ssh?.enabled
													? t("settings.securityAudit.enabled")
													: t("settings.securityAudit.notEnabledSsh")
											}
										/>
										<StatusRow
											label={t("settings.securityAudit.keyAuth")}
											isEnabled={data?.ssh?.keyAuth}
											description={
												data?.ssh?.keyAuth
													? t("settings.securityAudit.keyAuthRecommended")
													: t("settings.securityAudit.notEnabledKeyAuth")
											}
										/>
										<StatusRow
											label={t("settings.securityAudit.passwordAuth")}
											isEnabled={data?.ssh?.passwordAuth === "no"}
											description={
												data?.ssh?.passwordAuth === "no"
													? t("settings.securityAudit.disabledRecommended")
													: t("settings.securityAudit.enabledPasswordAuth")
											}
										/>
										<StatusRow
											label={t("settings.securityAudit.usePam")}
											isEnabled={data?.ssh?.usePam === "no"}
											description={
												data?.ssh?.usePam === "no"
													? t(
															"settings.securityAudit.disabledRecommendedKeyAuth",
														)
													: t("settings.securityAudit.enabledShouldBeDisabled")
											}
										/>
									</div>
								</div>

								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">
										{t("settings.securityAudit.fail2ban")}
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										{t("settings.securityAudit.fail2banDescription")}
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label={t("settings.securityAudit.installed")}
											isEnabled={data?.fail2ban?.installed}
											description={
												data?.fail2ban?.installed
													? t("settings.securityAudit.installedRecommended")
													: t("settings.securityAudit.notInstalledFail2ban")
											}
										/>

										<StatusRow
											label={t("settings.securityAudit.enabled")}
											isEnabled={data?.fail2ban?.enabled}
											description={
												data?.fail2ban?.enabled
													? t("settings.securityAudit.installedRecommended")
													: t("settings.securityAudit.notEnabledFail2ban")
											}
										/>
										<StatusRow
											label={t("settings.securityAudit.status")}
											isEnabled={data?.fail2ban?.active}
											description={
												data?.fail2ban?.active
													? t("settings.securityAudit.activeRecommended")
													: t("settings.securityAudit.notActiveFail2ban")
											}
										/>

										<StatusRow
											label={t("settings.securityAudit.sshProtection")}
											isEnabled={data?.fail2ban?.sshEnabled === "true"}
											description={
												data?.fail2ban?.sshEnabled === "true"
													? t("settings.securityAudit.keyAuthRecommended")
													: t("settings.securityAudit.notEnabledSshProtection")
											}
										/>

										<StatusRow
											label={t("settings.securityAudit.sshMode")}
											isEnabled={data?.fail2ban?.sshMode === "aggressive"}
											description={
												data?.fail2ban?.sshMode === "aggressive"
													? t(
															"settings.securityAudit.aggressiveModeRecommended",
														)
													: t("settings.securityAudit.modeNotSet", {
															value: data?.fail2ban?.sshMode || "Not Set",
														})
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
