import copy from "copy-to-clipboard";
import { CopyIcon, ExternalLinkIcon, ServerIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { DialogAction } from "@/components/shared/dialog-action";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { ShowDeployment } from "../../application/deployments/show-deployment";
import { type LogLine, parseLogs } from "../../docker/logs/utils";
import { EditScript } from "./edit-script";
import { GPUSupport } from "./gpu-support";
import { SecurityAudit } from "./security-audit";
import { SetupMonitoring } from "./setup-monitoring";
import { ValidateServer } from "./validate-server";

interface Props {
	serverId: string;
}

export const SetupServer = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data: server } = api.server.one.useQuery(
		{
			serverId,
		},
		{
			enabled: !!serverId,
		},
	);

	const [activeLog, setActiveLog] = useState<string | null>(null);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	api.server.setupWithLogs.useSubscription(
		{
			serverId: serverId,
		},
		{
			enabled: isDeploying,
			onData(log) {
				if (!isDrawerOpen) {
					setIsDrawerOpen(true);
				}

				if (log === "Deployment completed successfully!") {
					setIsDeploying(false);
				}
				const parsedLogs = parseLogs(log);
				setFilteredLogs((prev) => [...prev, ...parsedLogs]);
			},
			onError(error) {
				console.error("Deployment logs error:", error);
				setIsDeploying(false);
			},
		},
	);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Setup Server
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl  ">
				<DialogHeader>
					<div className="flex flex-col gap-1.5">
						<DialogTitle className="flex items-center gap-2">
							<ServerIcon className="size-5" /> Setup Server
						</DialogTitle>
						<p className="text-muted-foreground text-sm">
							To setup a server, please click on the button below.
						</p>
					</div>
				</DialogHeader>
				{!server?.sshKeyId ? (
					<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
						<AlertBlock type="warning">
							Please add a SSH Key to your server before setting up the server.
							you can assign a SSH Key to your server in Edit Server.
						</AlertBlock>
					</div>
				) : (
					<div id="hook-form-add-gitlab" className="grid w-full gap-4">
						<AlertBlock type="warning">
							Using a root user is required to ensure everything works as
							expected.
						</AlertBlock>

						<Tabs defaultValue="ssh-keys">
							<TabsList
								className={cn(
									"grid  w-[700px]",
									isCloud ? "grid-cols-6" : "grid-cols-5",
								)}
							>
								<TabsTrigger value="ssh-keys">SSH Keys</TabsTrigger>
								<TabsTrigger value="deployments">Deployments</TabsTrigger>
								<TabsTrigger value="validate">Validate</TabsTrigger>
								<TabsTrigger value="audit">Security</TabsTrigger>
								{isCloud && (
									<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
								)}
								<TabsTrigger value="gpu-setup">GPU Setup</TabsTrigger>
							</TabsList>
							<TabsContent
								value="ssh-keys"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
									<p className="text-primary text-base font-semibold">
										You have two options to add SSH Keys to your server:
									</p>

									<ul>
										<li>
											1. Add the public SSH Key when you create a server in your
											preffered provider (Hostinger, Digital Ocean, Hetzner,
											etc){" "}
										</li>
										<li>2. Add The SSH Key to Server Manually</li>
									</ul>
									<div className="flex flex-col gap-4 w-full overflow-auto">
										<div className="flex relative flex-col gap-2 overflow-y-auto">
											<div className="text-sm text-primary flex flex-row gap-2 items-center">
												Copy Public Key ({server?.sshKey?.name})
												<button
													type="button"
													className="right-2 top-8"
													onClick={() => {
														copy(
															server?.sshKey?.publicKey || "Generate a SSH Key",
														);
														toast.success("SSH Copied to clipboard");
													}}
												>
													<CopyIcon className="size-4 text-muted-foreground" />
												</button>
											</div>
										</div>
									</div>

									<div className="flex flex-col gap-2 w-full mt-2 border rounded-lg p-4">
										<span className="text-base font-semibold text-primary">
											Automatic process
										</span>
										<Link
											href="https://docs.dokploy.com/docs/core/multi-server/instructions#requirements"
											target="_blank"
											className="text-primary flex flex-row gap-2"
										>
											View Tutorial <ExternalLinkIcon className="size-4" />
										</Link>
									</div>
									<div className="flex flex-col gap-2 w-full border rounded-lg p-4">
										<span className="text-base font-semibold text-primary">
											Manual process
										</span>
										<ul>
											<li className="items-center flex gap-1">
												1. Login to your server{" "}
												<span className="text-primary bg-secondary p-1 rounded-lg">
													ssh {server?.username}@{server?.ipAddress}
												</span>
												<button
													type="button"
													onClick={() => {
														copy(
															`ssh ${server?.username}@${server?.ipAddress}`,
														);
														toast.success("Copied to clipboard");
													}}
												>
													<CopyIcon className="size-4" />
												</button>
											</li>
											<li>
												2. When you are logged in run the following command
												<div className="flex  relative flex-col gap-4 w-full mt-2">
													<CodeEditor
														lineWrapping
														language="properties"
														value={`echo "${server?.sshKey?.publicKey}" >> ~/.ssh/authorized_keys`}
														readOnly
														className="font-mono opacity-60"
													/>
													<button
														type="button"
														className="absolute right-2 top-2"
														onClick={() => {
															copy(
																`echo "${server?.sshKey?.publicKey}" >> ~/.ssh/authorized_keys`,
															);
															toast.success("Copied to clipboard");
														}}
													>
														<CopyIcon className="size-4" />
													</button>
												</div>
											</li>
											<li className="mt-1">
												3. You're done, you can test the connection by entering
												to the terminal or by setting up the server tab.
											</li>
										</ul>
									</div>
									<div className="flex flex-col gap-2 w-full border rounded-lg p-4">
										<span className="text-base font-semibold text-primary">
											Supported Distros:
										</span>
										<p>
											We strongly recommend to use the following distros to
											ensure the best experience:
										</p>
										<ul>
											<li>1. Ubuntu 24.04 LTS</li>
											<li>2. Ubuntu 23.10 LTS </li>
											<li>3. Ubuntu 22.04 LTS</li>
											<li>4. Ubuntu 20.04 LTS</li>
											<li>5. Ubuntu 18.04 LTS</li>
											<li>6. Debian 12</li>
											<li>7. Debian 11</li>
											<li>8. Debian 10</li>
											<li>9. Fedora 40</li>
											<li>10. Centos 9</li>
											<li>11. Centos 8</li>
										</ul>
									</div>
								</div>
							</TabsContent>
							<TabsContent value="deployments">
								<CardContent className="p-0">
									<div className="flex flex-col gap-4">
										<Card className="bg-background">
											<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
												<div className="flex flex-row gap-2 justify-between w-full max-sm:flex-col">
													<div className="flex flex-col gap-1">
														<CardTitle className="text-xl">
															Setup Server
														</CardTitle>
														<CardDescription>
															To setup a server, please click on the button
															below.
														</CardDescription>
													</div>
												</div>
											</CardHeader>
											<CardContent className="flex flex-col gap-4 min-h-[25vh] items-center">
												<div className="flex flex-col gap-4 items-center h-full max-w-xl mx-auto min-h-[25vh] justify-center">
													<span className="text-sm text-muted-foreground text-center">
														When your server is ready, you can click on the
														button below, to directly run the script we use for
														setup the server or directly modify the script
													</span>
													<div className="flex flex-row gap-2">
														<EditScript serverId={server?.serverId || ""} />
														<DialogAction
															title={"Setup Server?"}
															type="default"
															description="This will setup the server and all associated data"
															onClick={async () => {
																setIsDeploying(true);
															}}
														>
															<Button>Setup Server</Button>
														</DialogAction>
													</div>
												</div>

												<ShowDeployment
													open={activeLog !== null}
													onClose={() => setActiveLog(null)}
													logPath={activeLog}
												/>
											</CardContent>
										</Card>
									</div>
								</CardContent>
							</TabsContent>
							<TabsContent
								value="validate"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
									<ValidateServer serverId={serverId} />
								</div>
							</TabsContent>
							<TabsContent
								value="audit"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
									<SecurityAudit serverId={serverId} />
								</div>
							</TabsContent>
							<TabsContent
								value="monitoring"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 text-sm pt-3">
									<div className="rounded-xl bg-background shadow-md border">
										<SetupMonitoring serverId={serverId} />
									</div>
								</div>
							</TabsContent>
							<TabsContent
								value="gpu-setup"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
									<GPUSupport serverId={serverId} />
								</div>
							</TabsContent>
						</Tabs>
					</div>
				)}
			</DialogContent>
			<DrawerLogs
				isOpen={isDrawerOpen}
				onClose={() => {
					setIsDrawerOpen(false);
					setFilteredLogs([]);
					setIsDeploying(false);
				}}
				filteredLogs={filteredLogs}
			/>
		</Dialog>
	);
};
