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
import copy from "copy-to-clipboard";
import { CopyIcon, ExternalLinkIcon, ServerIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
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
	const { t } = useTranslation("settings");
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
					{t("settings.setupServer.setupServer")}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl  ">
				<DialogHeader>
					<div className="flex flex-col gap-1.5">
						<DialogTitle className="flex items-center gap-2">
							<ServerIcon className="size-5" />{" "}
							{t("settings.setupServer.setupServer")}
						</DialogTitle>
						<p className="text-muted-foreground text-sm">
							{t("settings.setupServer.description")}
						</p>
					</div>
				</DialogHeader>
				{!server?.sshKeyId ? (
					<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
						<AlertBlock type="warning">
							{t("settings.setupServer.addSshKeyWarning")}
						</AlertBlock>
					</div>
				) : (
					<div id="hook-form-add-gitlab" className="grid w-full gap-4">
						<AlertBlock type="warning">
							{t("settings.setupServer.rootUserRequired")}
						</AlertBlock>

						<Tabs defaultValue="ssh-keys">
							<TabsList
								className={cn(
									"grid  w-[700px]",
									isCloud ? "grid-cols-6" : "grid-cols-5",
								)}
							>
								<TabsTrigger value="ssh-keys">
									{t("settings.setupServer.sshKeys")}
								</TabsTrigger>
								<TabsTrigger value="deployments">
									{t("settings.setupServer.deployments")}
								</TabsTrigger>
								<TabsTrigger value="validate">
									{t("settings.setupServer.validate")}
								</TabsTrigger>
								<TabsTrigger value="audit">
									{t("settings.setupServer.audit")}
								</TabsTrigger>
								{isCloud && (
									<TabsTrigger value="monitoring">
										{t("settings.setupServer.monitoring")}
									</TabsTrigger>
								)}
								<TabsTrigger value="gpu-setup">
									{t("settings.setupServer.gpuSetup")}
								</TabsTrigger>
							</TabsList>
							<TabsContent
								value="ssh-keys"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
									<p className="text-primary text-base font-semibold">
										{t("settings.setupServer.twoOptions")}
									</p>

									<ul>
										<li>{t("settings.setupServer.option1")} </li>
										<li>{t("settings.setupServer.option2")}</li>
									</ul>
									<div className="flex flex-col gap-4 w-full overflow-auto">
										<div className="flex relative flex-col gap-2 overflow-y-auto">
											<div className="text-sm text-primary flex flex-row gap-2 items-center">
												{t("settings.setupServer.copyPublicKey", {
													name: server?.sshKey?.name,
												})}
												<button
													type="button"
													className="right-2 top-8"
													onClick={() => {
														copy(
															server?.sshKey?.publicKey ||
																t("settings.setupServer.generateSshKey"),
														);
														toast.success(
															t("settings.setupServer.sshCopiedToClipboard"),
														);
													}}
												>
													<CopyIcon className="size-4 text-muted-foreground" />
												</button>
											</div>
										</div>
									</div>

									<div className="flex flex-col gap-2 w-full mt-2 border rounded-lg p-4">
										<span className="text-base font-semibold text-primary">
											{t("settings.setupServer.automaticProcess")}
										</span>
										<Link
											href="https://docs.dokploy.com/docs/core/multi-server/instructions#requirements"
											target="_blank"
											className="text-primary flex flex-row gap-2"
										>
											{t("settings.setupServer.viewTutorial")}{" "}
											<ExternalLinkIcon className="size-4" />
										</Link>
									</div>
									<div className="flex flex-col gap-2 w-full border rounded-lg p-4">
										<span className="text-base font-semibold text-primary">
											{t("settings.setupServer.manualProcess")}
										</span>
										<ul>
											<li className="items-center flex gap-1">
												{t("settings.setupServer.loginToServer")}{" "}
												<span className="text-primary bg-secondary p-1 rounded-lg">
													ssh {server?.username}@{server?.ipAddress}
												</span>
												<button
													type="button"
													onClick={() => {
														copy(
															`ssh ${server?.username}@${server?.ipAddress}`,
														);
														toast.success(
															t("settings.setupServer.copiedToClipboard"),
														);
													}}
												>
													<CopyIcon className="size-4" />
												</button>
											</li>
											<li>
												{t("settings.setupServer.runCommand")}
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
															toast.success(
																t("settings.setupServer.copiedToClipboard"),
															);
														}}
													>
														<CopyIcon className="size-4" />
													</button>
												</div>
											</li>
											<li className="mt-1">
												{t("settings.setupServer.youreDone")}
											</li>
										</ul>
									</div>
									<div className="flex flex-col gap-2 w-full border rounded-lg p-4">
										<span className="text-base font-semibold text-primary">
											{t("settings.setupServer.supportedDistros")}
										</span>
										<p>{t("settings.setupServer.distrosDescription")}</p>
										<ul>
											<li>{t("settings.setupServer.ubuntu2404")}</li>
											<li>{t("settings.setupServer.ubuntu2310")}</li>
											<li>{t("settings.setupServer.ubuntu2204")}</li>
											<li>{t("settings.setupServer.ubuntu2004")}</li>
											<li>{t("settings.setupServer.ubuntu1804")}</li>
											<li>{t("settings.setupServer.debian12")}</li>
											<li>{t("settings.setupServer.debian11")}</li>
											<li>{t("settings.setupServer.debian10")}</li>
											<li>{t("settings.setupServer.fedora40")}</li>
											<li>{t("settings.setupServer.centos9")}</li>
											<li>{t("settings.setupServer.centos8")}</li>
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
															{t("settings.setupServer.setupServer")}
														</CardTitle>
														<CardDescription>
															{t("settings.setupServer.description")}
														</CardDescription>
													</div>
												</div>
											</CardHeader>
											<CardContent className="flex flex-col gap-4 min-h-[25vh] items-center">
												<div className="flex flex-col gap-4 items-center h-full max-w-xl mx-auto min-h-[25vh] justify-center">
													<span className="text-sm text-muted-foreground text-center">
														{t("settings.setupServer.serverReady")}
													</span>
													<div className="flex flex-row gap-2">
														<EditScript serverId={server?.serverId || ""} />
														<DialogAction
															title={t(
																"settings.setupServer.setupServerQuestion",
															)}
															type="default"
															description={t(
																"settings.setupServer.setupServerDescription",
															)}
															onClick={async () => {
																setIsDeploying(true);
															}}
														>
															<Button>
																{t("settings.setupServer.setupServer")}
															</Button>
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
