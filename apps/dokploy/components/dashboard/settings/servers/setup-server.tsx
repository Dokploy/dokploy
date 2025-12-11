import copy from "copy-to-clipboard";
import { CopyIcon, ExternalLinkIcon, ServerIcon } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
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
	const { t } = useTranslation("settings");
	const { t: tCommon } = useTranslation("common");
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
	const isBuildServer = server?.serverType === "build";
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
					{t("settings.servers.onboarding.setup.button")}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl  ">
				<DialogHeader>
					<div className="flex flex-col gap-1.5">
						<DialogTitle className="flex items-center gap-2">
							<ServerIcon className="size-5" />
							{t("settings.servers.onboarding.setup.cardTitle")}
						</DialogTitle>
						<p className="text-muted-foreground text-sm">
							{t("settings.servers.onboarding.setup.cardDescription")}
						</p>
					</div>
				</DialogHeader>
				{!server?.sshKeyId ? (
					<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
						<AlertBlock type="warning">
							{t("settings.servers.setup.noSshKeyWarning")}
						</AlertBlock>
					</div>
				) : (
					<div id="hook-form-add-gitlab" className="grid w-full gap-4">
						<AlertBlock type="warning">
							{t("settings.servers.setup.rootUserWarning")}
						</AlertBlock>

						<Tabs defaultValue="ssh-keys">
							<TabsList
								className={cn(
									"grid  w-[700px]",
									isBuildServer
										? "grid-cols-3"
										: isCloud
											? "grid-cols-6"
											: "grid-cols-5",
								)}
							>
								<TabsTrigger value="ssh-keys">
									{t("settings.sshKeys.page.title")}
								</TabsTrigger>
								<TabsTrigger value="deployments">
									{tCommon("tabs.deployments")}
								</TabsTrigger>
								<TabsTrigger value="validate">
									{t("settings.servers.setup.tabs.validate")}
								</TabsTrigger>

								{!isBuildServer && (
									<>
										<TabsTrigger value="audit">
											{t("settings.servers.setup.tabs.security")}
										</TabsTrigger>
										{isCloud && (
											<TabsTrigger value="monitoring">
												{tCommon("tabs.monitoring")}
											</TabsTrigger>
										)}
										<TabsTrigger value="gpu-setup">
											{t("settings.servers.setup.tabs.gpuSetup")}
										</TabsTrigger>
									</>
								)}
							</TabsList>
							<TabsContent
								value="ssh-keys"
								className="outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
							>
								<div className="flex flex-col gap-2 text-sm text-muted-foreground pt-3">
									<p className="text-primary text-base font-semibold">
										{t("settings.sshKeys.welcome.title")}
									</p>

									<ul>
										<li>
											1. {t("settings.sshKeys.welcome.optionProvider")}
										</li>
										<li>
											2. {t("settings.sshKeys.welcome.optionManual")}
										</li>
									</ul>
									<div className="flex flex-col gap-4 w-full overflow-auto">
										<div className="flex relative flex-col gap-2 overflow-y-auto">
											<div className="text-sm text-primary flex flex-row gap-2 items-center">
												{t("settings.sshKeys.welcome.provider.copyLabel")} ({server?.sshKey?.name})
												<button
													type="button"
													className="right-2 top-8"
													onClick={() => {
														copy(
															server?.sshKey?.publicKey ||
																t("settings.sshKeys.welcome.provider.missingKeyFallback"),
														);
														toast.success(
															t("settings.sshKeys.welcome.copyPublicKey"),
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
											{t("settings.sshKeys.welcome.provider.title")}
										</span>
										<Link
											href="https://docs.dokploy.com/docs/core/multi-server/instructions#requirements"
											target="_blank"
											className="text-primary flex flex-row gap-2"
										>
											{t("settings.sshKeys.welcome.provider.tutorial")} {" "}
											<ExternalLinkIcon className="size-4" />
										</Link>
									</div>
									<div className="flex flex-col gap-2 w-full border rounded-lg p-4">
										<span className="text-base font-semibold text-primary">
											{t("settings.sshKeys.welcome.manual.title")}
										</span>
										<ul>
											<li className="items-center flex gap-1">
												{t("settings.sshKeys.welcome.manual.step1")} {" "}
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
															t("settings.sshKeys.welcome.copyCommand"),
														);
													}}
												>
													<CopyIcon className="size-4" />
												</button>
											</li>
											<li>
												{t("settings.sshKeys.welcome.manual.step2")}
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
																t("settings.sshKeys.welcome.copyCommand"),
															);
														}}
													>
														<CopyIcon className="size-4" />
													</button>
												</div>
											</li>
											<li className="mt-1">
												{t("settings.sshKeys.welcome.manual.step3")}
											</li>
										</ul>
									</div>
									<div className="flex flex-col gap-2 w-full border rounded-lg p-4">
										<span className="text-base font-semibold text-primary">
											{t("settings.servers.setup.supportedDistros.title")}
										</span>
										<p>
											{t("settings.servers.setup.supportedDistros.description")}
										</p>
										<ul>
											<li>
												1. {t("settings.servers.onboarding.requisites.supportedDistros.ubuntu2404")}
											</li>
											<li>
												2. {t("settings.servers.onboarding.requisites.supportedDistros.ubuntu2310")}
											</li>
											<li>
												3. {t("settings.servers.onboarding.requisites.supportedDistros.ubuntu2204")}
											</li>
											<li>
												4. {t("settings.servers.onboarding.requisites.supportedDistros.ubuntu2004")}
											</li>
											<li>
												5. {t("settings.servers.onboarding.requisites.supportedDistros.ubuntu1804")}
											</li>
											<li>
												6. {t("settings.servers.onboarding.requisites.supportedDistros.debian12")}
											</li>
											<li>
												7. {t("settings.servers.onboarding.requisites.supportedDistros.debian11")}
											</li>
											<li>
												8. {t("settings.servers.onboarding.requisites.supportedDistros.debian10")}
											</li>
											<li>
												9. {t("settings.servers.onboarding.requisites.supportedDistros.fedora40")}
											</li>
											<li>
												10. {t("settings.servers.onboarding.requisites.supportedDistros.centos9")}
											</li>
											<li>
												11. {t("settings.servers.onboarding.requisites.supportedDistros.centos8")}
											</li>
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
															{t("settings.servers.onboarding.setup.cardTitle")}
														</CardTitle>
														<CardDescription>
															{t("settings.servers.onboarding.setup.cardDescription")}
														</CardDescription>
													</div>
												</div>
											</CardHeader>
											<CardContent className="flex flex-col gap-4 min-h-[25vh] items-center">
												<div className="flex flex-col gap-4 items-center h-full max-w-xl mx-auto min-h-[25vh] justify-center">
													<span className="text-sm text-muted-foreground text-center">
														{t("settings.servers.onboarding.setup.helperText")}
													</span>
													<div className="flex flex-row gap-2">
														<EditScript serverId={server?.serverId || ""} />
														<DialogAction
															title={t("settings.servers.onboarding.setup.dialog.title")}
															type="default"
															description={t(
																"settings.servers.onboarding.setup.dialog.description",
															)}
															onClick={async () => {
																setIsDeploying(true);
															}}
														>
															<Button>
																{t("settings.servers.onboarding.setup.button")}
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
							{!isBuildServer && (
								<>
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
								</>
							)}
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
