import { Loader2, LockKeyhole, RefreshCw } from "lucide-react";
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
										Setup Security Suggestions
									</CardTitle>
								</div>
								<CardDescription>
									Check the security suggestions
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
								Refresh
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
							Ubuntu/Debian OS support is currently supported (Experimental)
						</AlertBlock>
						{isLoading ? (
							<div className="flex items-center justify-center text-muted-foreground py-4">
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								<span>Checking Server configuration</span>
							</div>
						) : (
							<div className="grid w-full gap-4">
								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">UFW</h3>
									<p className="text-sm text-muted-foreground mb-4">
										UFW (Uncomplicated Firewall) is a simple firewall that can
										be used to block incoming and outgoing traffic from your
										server.
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label="UFW Installed"
											isEnabled={data?.ufw?.installed}
											description={
												data?.ufw?.installed
													? "Installed (Recommended)"
													: "Not Installed (UFW should be installed for security)"
											}
										/>
										<StatusRow
											label="Status"
											isEnabled={data?.ufw?.active}
											description={
												data?.ufw?.active
													? "Active (Recommended)"
													: "Not Active (UFW should be enabled for security)"
											}
										/>
										<StatusRow
											label="Default Incoming"
											isEnabled={data?.ufw?.defaultIncoming === "deny"}
											description={
												data?.ufw?.defaultIncoming === "deny"
													? "Default: Deny (Recommended)"
													: `Default: ${data?.ufw?.defaultIncoming} (Should be set to 'deny' for security)`
											}
										/>
									</div>
								</div>

								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">SSH</h3>
									<p className="text-sm text-muted-foreground mb-4">
										SSH (Secure Shell) is a protocol that allows you to securely
										connect to a server and execute commands on it.
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label="Enabled"
											isEnabled={data?.ssh?.enabled}
											description={
												data?.ssh?.enabled
													? "Enabled"
													: "Not Enabled (SSH should be enabled)"
											}
										/>
										<StatusRow
											label="Key Auth"
											isEnabled={data?.ssh?.keyAuth}
											description={
												data?.ssh?.keyAuth
													? "Enabled (Recommended)"
													: "Not Enabled (Key Authentication should be enabled)"
											}
										/>
										<StatusRow
											label="Password Auth"
											isEnabled={data?.ssh?.passwordAuth === "no"}
											description={
												data?.ssh?.passwordAuth === "no"
													? "Disabled (Recommended)"
													: "Enabled (Password Authentication should be disabled)"
											}
										/>
										<StatusRow
											label="Use PAM"
											isEnabled={data?.ssh?.usePam === "no"}
											description={
												data?.ssh?.usePam === "no"
													? "Disabled (Recommended for key-based auth)"
													: "Enabled (Should be disabled when using key-based auth)"
											}
										/>
									</div>
								</div>

								<div className="border rounded-lg p-4">
									<h3 className="text-lg font-semibold mb-1">Fail2Ban</h3>
									<p className="text-sm text-muted-foreground mb-4">
										Fail2Ban (Fail2Ban) is a service that can be used to prevent
										brute force attacks on your server.
									</p>
									<div className="grid gap-2.5">
										<StatusRow
											label="Installed"
											isEnabled={data?.fail2ban?.installed}
											description={
												data?.fail2ban?.installed
													? "Installed (Recommended)"
													: "Not Installed (Fail2Ban should be installed for protection against brute force attacks)"
											}
										/>

										<StatusRow
											label="Enabled"
											isEnabled={data?.fail2ban?.enabled}
											description={
												data?.fail2ban?.enabled
													? "Enabled (Recommended)"
													: "Not Enabled (Fail2Ban service should be enabled)"
											}
										/>
										<StatusRow
											label="Active"
											isEnabled={data?.fail2ban?.active}
											description={
												data?.fail2ban?.active
													? "Active (Recommended)"
													: "Not Active (Fail2Ban service should be running)"
											}
										/>

										<StatusRow
											label="SSH Protection"
											isEnabled={data?.fail2ban?.sshEnabled === "true"}
											description={
												data?.fail2ban?.sshEnabled === "true"
													? "Enabled (Recommended)"
													: "Not Enabled (SSH protection should be enabled to prevent brute force attacks)"
											}
										/>

										<StatusRow
											label="SSH Mode"
											isEnabled={data?.fail2ban?.sshMode === "aggressive"}
											description={
												data?.fail2ban?.sshMode === "aggressive"
													? "Aggressive Mode (Recommended)"
													: `Mode: ${data?.fail2ban?.sshMode || "Not Set"} (Aggressive mode recommended for better protection)`
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
