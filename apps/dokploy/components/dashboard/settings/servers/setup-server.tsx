import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { StatusTooltip } from "@/components/shared/status-tooltip";
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
import { api } from "@/utils/api";
import copy from "copy-to-clipboard";
import {
	CopyIcon,
	ExternalLinkIcon,
	RocketIcon,
	ServerIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ShowDeployment } from "../../application/deployments/show-deployment";
import { EditScript } from "./edit-script";
import { GPUSupport } from "./gpu-support";
import { SecurityAudit } from "./security-audit";
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
	const { data: deployments, refetch } = api.deployment.allByServer.useQuery(
		{ serverId },
		{
			enabled: !!serverId,
		},
	);

	const { mutateAsync, isLoading } = api.server.setup.useMutation();

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
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-4xl ">
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
					<div className="flex flex-col gap-2 pt-3 text-muted-foreground text-sm">
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
							<TabsList className="grid w-[700px] grid-cols-5">
								<TabsTrigger value="ssh-keys">SSH Keys</TabsTrigger>
								<TabsTrigger value="deployments">Deployments</TabsTrigger>
								<TabsTrigger value="validate">Validate</TabsTrigger>
								<TabsTrigger value="audit">Security</TabsTrigger>
								<TabsTrigger value="gpu-setup">GPU Setup</TabsTrigger>
							</TabsList>
							<TabsContent
								value="ssh-keys"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 pt-3 text-muted-foreground text-sm">
									<p className="font-semibold text-base text-primary">
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
									<div className="flex w-full flex-col gap-4 overflow-auto">
										<div className="relative flex flex-col gap-2 overflow-y-auto">
											<div className="flex flex-row items-center gap-2 text-primary text-sm">
												Copy Public Key ({server?.sshKey?.name})
												<button
													type="button"
													className=" top-8 right-2"
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

									<div className="mt-2 flex w-full flex-col gap-2 rounded-lg border p-4">
										<span className="font-semibold text-base text-primary">
											Automatic process
										</span>
										<Link
											href="https://docs.dokploy.com/docs/core/multi-server/instructions#requirements"
											target="_blank"
											className="flex flex-row gap-2 text-primary"
										>
											View Tutorial <ExternalLinkIcon className="size-4" />
										</Link>
									</div>
									<div className="flex w-full flex-col gap-2 rounded-lg border p-4">
										<span className="font-semibold text-base text-primary">
											Manual process
										</span>
										<ul>
											<li className="flex items-center gap-1">
												1. Login to your server{" "}
												<span className="rounded-lg bg-secondary p-1 text-primary">
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
												<div className="relative mt-2 flex w-full flex-col gap-4">
													<CodeEditor
														lineWrapping
														language="properties"
														value={`echo "${server?.sshKey?.publicKey}" >> ~/.ssh/authorized_keys`}
														readOnly
														className="font-mono opacity-60"
													/>
													<button
														type="button"
														className="absolute top-2 right-2"
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
									<div className="flex w-full flex-col gap-2 rounded-lg border p-4">
										<span className="font-semibold text-base text-primary">
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
											<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
												<div className="flex w-full flex-row justify-between gap-2 max-sm:flex-col">
													<div className="flex flex-col gap-1">
														<CardTitle className="text-xl">
															Deployments
														</CardTitle>
														<CardDescription>
															See all the 5 Server Setup
														</CardDescription>
													</div>
													<div className="flex flex-row gap-2">
														<EditScript serverId={server?.serverId || ""} />
														<DialogAction
															title={"Setup Server?"}
															description="This will setup the server and all associated data"
															onClick={async () => {
																await mutateAsync({
																	serverId: server?.serverId || "",
																})
																	.then(async () => {
																		refetch();
																		toast.success("Server setup successfully");
																	})
																	.catch(() => {
																		toast.error("Error configuring server");
																	});
															}}
														>
															<Button isLoading={isLoading}>
																Setup Server
															</Button>
														</DialogAction>
													</div>
												</div>
											</CardHeader>
											<CardContent className="flex flex-col gap-4">
												{server?.deployments?.length === 0 ? (
													<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
														<RocketIcon className="size-8 text-muted-foreground" />
														<span className="text-base text-muted-foreground">
															No deployments found
														</span>
													</div>
												) : (
													<div className="flex flex-col gap-4">
														{deployments?.map((deployment) => (
															<div
																key={deployment.deploymentId}
																className="flex items-center justify-between gap-2 rounded-lg border p-4"
															>
																<div className="flex flex-col">
																	<span className="flex items-center gap-4 font-medium text-foreground capitalize">
																		{deployment.status}

																		<StatusTooltip
																			status={deployment?.status}
																			className="size-2.5"
																		/>
																	</span>
																	<span className="text-muted-foreground text-sm">
																		{deployment.title}
																	</span>
																	{deployment.description && (
																		<span className="break-all text-muted-foreground text-sm">
																			{deployment.description}
																		</span>
																	)}
																</div>
																<div className="flex flex-col items-end gap-2">
																	<div className="text-muted-foreground text-sm capitalize">
																		<DateTooltip date={deployment.createdAt} />
																	</div>

																	<Button
																		onClick={() => {
																			setActiveLog(deployment.logPath);
																		}}
																	>
																		View
																	</Button>
																</div>
															</div>
														))}
													</div>
												)}

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
								<div className="flex flex-col gap-2 pt-3 text-muted-foreground text-sm">
									<ValidateServer serverId={serverId} />
								</div>
							</TabsContent>
							<TabsContent
								value="audit"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 pt-3 text-muted-foreground text-sm">
									<SecurityAudit serverId={serverId} />
								</div>
							</TabsContent>
							<TabsContent
								value="gpu-setup"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 pt-3 text-muted-foreground text-sm">
									<GPUSupport serverId={serverId} />
								</div>
							</TabsContent>
						</Tabs>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};
