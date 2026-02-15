import {
	AlertTriangle,
	CheckCircle2,
	Loader2,
	Server,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/utils/api";

type ServiceType =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis";

interface Props {
	id: string;
	type: ServiceType;
	currentServerId?: string | null;
}

type Step = "select" | "scanning" | "review" | "transferring" | "done";

interface ConflictFile {
	path: string;
	decisionKey?: string;
	size: number;
	mtime: number;
	status: string;
	hash?: string;
	targetInfo?: { mtime: number; hash?: string };
}

interface ScanResult {
	serviceDir?: { path: string; files: unknown[] };
	traefikConfig?: {
		sourceExists: boolean;
		targetExists: boolean;
		hasConflict: boolean;
	};
	volumes: Array<{
		volumeName: string;
		mountPath: string;
		sizeBytes: number;
		files: ConflictFile[];
	}>;
	binds: Array<{
		hostPath: string;
		files: ConflictFile[];
	}>;
	totalSizeBytes: number;
	conflicts: ConflictFile[];
	hasConflicts: boolean;
}

interface TransferProgress {
	phase: string;
	currentFile?: string;
	processedFiles: number;
	totalFiles: number;
	transferredBytes: number;
	totalBytes: number;
	percentage: number;
}

interface ScanProgress {
	phase: string;
	mount?: string;
	currentFile?: string;
	processedMounts: number;
	totalMounts: number;
	scannedFiles: number;
	processedHashes: number;
	totalHashes: number;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
	if (!timestamp) return "-";
	return new Date(timestamp * 1000).toLocaleString();
}

function getConflictDecisionKey(conflict: ConflictFile): string {
	return conflict.decisionKey || conflict.path;
}

function getStatusBadge(status: string) {
	switch (status) {
		case "missing_target":
			return <Badge variant="secondary">New</Badge>;
		case "newer_source":
			return <Badge className="bg-blue-500">Updated</Badge>;
		case "newer_target":
			return (
				<Badge variant="outline" className="border-orange-500 text-orange-500">
					Target Newer
				</Badge>
			);
		case "conflict":
			return <Badge variant="destructive">Conflict</Badge>;
		case "match":
			return (
				<Badge variant="outline" className="border-green-500 text-green-500">
					Match
				</Badge>
			);
		default:
			return <Badge variant="outline">{status}</Badge>;
	}
}

interface TransferInnerProps {
	id: string;
	type: ServiceType;
	currentServerId?: string | null;
	scanFn: (input: Record<string, unknown>) => Promise<unknown>;
	isScanning: boolean;
	scanStatusText?: string;
}

const TransferInner = ({
	id,
	type,
	currentServerId,
	scanFn,
	isScanning,
	scanStatusText,
}: TransferInnerProps) => {
	const utils = api.useUtils();
	const [selectedServerId, setSelectedServerId] = useState<string>("");
	const [step, setStep] = useState<Step>("select");
	const [scanResult, setScanResult] = useState<ScanResult | null>(null);
	const [decisions, setDecisions] = useState<
		Record<string, "skip" | "overwrite">
	>({});
	const [progress, setProgress] = useState<TransferProgress | null>(null);
	const [logs, setLogs] = useState<string[]>([]);

	// Shared state for controlling subscription
	const [isTransferring, setIsTransferring] = useState(false);

	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const availableServers = servers?.filter(
		(server) => server.serverId !== currentServerId,
	);
	const showDokployOption = !isCloud && currentServerId !== null;
	const hasAvailableTargets =
		(availableServers?.length ?? 0) > 0 || showDokployOption;
	const hasDomainCertificateFlow =
		type === "application" || type === "compose";

	const buildInput = (extra?: Record<string, unknown>) => {
		const targetServerId =
			selectedServerId === "dokploy" ? null : selectedServerId;
		const base: Record<string, unknown> = { targetServerId };

		if (type === "application") base.applicationId = id;
		else if (type === "compose") base.composeId = id;
		else if (type === "postgres") base.postgresId = id;
		else if (type === "mysql") base.mysqlId = id;
		else if (type === "mariadb") base.mariadbId = id;
		else if (type === "mongo") base.mongoId = id;
		else if (type === "redis") base.redisId = id;

		return { ...base, ...extra };
	};

	// Subscription input — built for the transferWithLogs call
	const subscriptionInput = buildInput({ decisions }) as never;

	// Callback for processing subscription data
	const handleSubscriptionData = (log: string) => {
		if (log === "Transfer completed successfully!") {
			setStep("done");
			setIsTransferring(false);
			toast.success("Service transferred successfully");
			utils.invalidate();
			return;
		}

		if (log.startsWith("Transfer failed:")) {
			setIsTransferring(false);
			setStep("review");
			toast.error(log);
			return;
		}

		// Try to parse as progress JSON
		try {
			const p = JSON.parse(log) as TransferProgress;
			setProgress(p);
			setLogs((prev) => {
				const phaseLabel = `[${p.phase}]`;
				const logLine = p.currentFile
					? `${phaseLabel} ${p.currentFile}`
					: phaseLabel;

				if (!p.currentFile) {
					const lastLog = prev[prev.length - 1];
					if (lastLog?.startsWith(phaseLabel)) return prev;
				}

				// Avoid duplicating same log
				if (prev.length > 0 && prev[prev.length - 1] === logLine) return prev;
				return [...prev.slice(-99), logLine]; // Keep last 100 logs
			});
		} catch {
			setLogs((prev) => [...prev.slice(-99), log]);
		}
	};

	const handleSubscriptionError = (error: { message: string }) => {
		console.error("Transfer subscription error:", error);
		setIsTransferring(false);
		setStep("review");
		toast.error("Transfer failed", {
			description: error.message || "Subscription disconnected unexpectedly",
		});
	};

	const handleScan = async () => {
		if (!selectedServerId) {
			toast.error("Please select a target server");
			return;
		}
		try {
			setStep("scanning");
			const result = (await scanFn(buildInput())) as ScanResult;
			setScanResult(result);
			const defaultDecisions: Record<string, "skip" | "overwrite"> = {};
			for (const conflict of result.conflicts) {
				defaultDecisions[getConflictDecisionKey(conflict)] = "overwrite";
			}
			setDecisions(defaultDecisions);
			setStep("review");
		} catch (error) {
			toast.error("Scan failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
			setStep("select");
		}
	};

	const startTransfer = () => {
		setStep("transferring");
		setProgress(null);
		setLogs([]);
		setIsTransferring(true);
	};

	const toggleDecision = (decisionKey: string) => {
		setDecisions((prev) => ({
			...prev,
			[decisionKey]: prev[decisionKey] === "overwrite" ? "skip" : "overwrite",
		}));
	};

	const resetFlow = () => {
		setStep("select");
		setScanResult(null);
		setDecisions({});
		setSelectedServerId("");
		setIsTransferring(false);
		setProgress(null);
		setLogs([]);
	};

	const serviceLabels: Record<ServiceType, string> = {
		application: "Application",
		compose: "Compose",
		postgres: "PostgreSQL",
		mysql: "MySQL",
		mariadb: "MariaDB",
		mongo: "MongoDB",
		redis: "Redis",
	};
	const serviceLabel = serviceLabels[type];

	const getCurrentServerName = () => {
		if (currentServerId === null || currentServerId === undefined) {
			return "Dokploy (Local)";
		}
		return (
			servers?.find((s) => s.serverId === currentServerId)?.name ??
			"Unknown Server"
		);
	};

	const getTargetServerName = () => {
		if (selectedServerId === "dokploy") return "Dokploy (Local)";
		return (
			servers?.find((s) => s.serverId === selectedServerId)?.name ??
			"Unknown Server"
		);
	};

	const totalConflicts = scanResult?.conflicts?.length ?? 0;

	return {
		subscriptionInput,
		isTransferring,
		handleSubscriptionData,
		handleSubscriptionError,
		render: hasAvailableTargets ? (
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl flex items-center gap-2">
						Transfer Service
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">
							<span className="font-medium">Current Server:</span>{" "}
							{getCurrentServerName()}
						</p>

						{/* Step 1: Select server */}
						{step === "select" && (
							<>
								<div className="flex flex-col gap-2">
									<label className="text-sm font-medium">Target Server</label>
									<Select
										value={selectedServerId}
										onValueChange={setSelectedServerId}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select target server" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectLabel>
													Available Servers (
													{(availableServers?.length ?? 0) +
														(showDokployOption ? 1 : 0)}
													)
												</SelectLabel>
												{showDokployOption && (
													<SelectItem value="dokploy">
														<span className="flex items-center gap-2">
															<Server className="h-4 w-4" />
															Dokploy (Local)
														</span>
													</SelectItem>
												)}
												{availableServers?.map((server) => (
													<SelectItem
														key={server.serverId}
														value={server.serverId}
													>
														<span className="flex items-center gap-2">
															<Server className="h-4 w-4" />
															{server.name}
														</span>
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</div>
								<Button
									onClick={handleScan}
									disabled={!selectedServerId || isScanning}
									variant="outline"
									className="w-full"
								>
									{isScanning ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Scanning...
										</>
									) : (
										"Scan for Transfer"
									)}
								</Button>
							</>
						)}

						{/* Step 2: Scanning */}
						{step === "scanning" && (
							<div className="flex items-center justify-center gap-2 py-8">
								<Loader2 className="h-5 w-5 animate-spin" />
								<span className="text-muted-foreground">
									{scanStatusText || "Scanning files on both servers..."}
								</span>
							</div>
						)}

						{/* Step 3: Review results */}
						{step === "review" && scanResult && (
							<div className="flex flex-col gap-4">
								<div className="grid grid-cols-2 gap-2 text-sm">
									<div className="text-muted-foreground">Target:</div>
									<div className="font-medium">{getTargetServerName()}</div>
									<div className="text-muted-foreground">Total size:</div>
									<div className="font-medium">
										{formatBytes(scanResult.totalSizeBytes)}
									</div>
									<div className="text-muted-foreground">Volumes:</div>
									<div className="font-medium">
										{scanResult.volumes.length}
									</div>
									{scanResult.serviceDir && (
										<>
											<div className="text-muted-foreground">Service dir:</div>
											<div className="font-medium">
												{scanResult.serviceDir.files.length} files
											</div>
										</>
									)}
									{totalConflicts > 0 && (
										<>
											<div className="text-muted-foreground">Conflicts:</div>
											<div className="font-medium text-orange-500">
												{totalConflicts}
											</div>
										</>
									)}
								</div>

								{totalConflicts > 0 && (
									<div className="border rounded-lg overflow-auto max-h-64">
										<Table>
												<TableHeader>
													<TableRow>
														<TableHead>File</TableHead>
														<TableHead>Size</TableHead>
														<TableHead>Status</TableHead>
														<TableHead>Source mtime</TableHead>
														<TableHead>Target mtime</TableHead>
														<TableHead>Source hash</TableHead>
														<TableHead>Target hash</TableHead>
														<TableHead>Action</TableHead>
													</TableRow>
												</TableHeader>
											<TableBody>
												{scanResult.conflicts.map((conflict) => (
													<TableRow key={getConflictDecisionKey(conflict)}>
														<TableCell className="font-mono text-xs max-w-48 truncate">
															{conflict.path}
														</TableCell>
														<TableCell className="text-xs">
															{formatBytes(conflict.size)}
														</TableCell>
														<TableCell>
															{getStatusBadge(conflict.status)}
														</TableCell>
														<TableCell className="text-xs">
															{formatDate(conflict.mtime)}
														</TableCell>
														<TableCell className="text-xs">
															{formatDate(conflict.targetInfo?.mtime ?? 0)}
														</TableCell>
														<TableCell className="font-mono text-xs max-w-28 truncate">
															{conflict.hash || "-"}
														</TableCell>
														<TableCell className="font-mono text-xs max-w-28 truncate">
															{conflict.targetInfo?.hash || "-"}
														</TableCell>
														<TableCell>
															<Button
																size="sm"
																variant={
																	decisions[getConflictDecisionKey(conflict)] ===
																	"overwrite"
																		? "default"
																		: "outline"
																}
																onClick={() =>
																	toggleDecision(getConflictDecisionKey(conflict))
																}
															>
																{decisions[getConflictDecisionKey(conflict)] ===
																"overwrite"
																	? "Overwrite"
																	: "Skip"}
															</Button>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}

								{totalConflicts === 0 && (
									<div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
										<CheckCircle2 className="h-4 w-4" />
										No conflicts detected — ready to transfer
									</div>
								)}

								<div className="flex gap-2">
									<Button
										variant="outline"
										onClick={resetFlow}
										className="flex-1"
									>
										Cancel
									</Button>
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button variant="default" className="flex-1">
												Transfer {serviceLabel}
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle className="flex items-center gap-2">
													<AlertTriangle className="h-5 w-5 text-orange-500" />
													Confirm Transfer
												</AlertDialogTitle>
												<AlertDialogDescription asChild>
													<div className="flex flex-col gap-2">
														<p>
															Transfer this {serviceLabel} to{" "}
															<span className="font-medium">
																{getTargetServerName()}
															</span>
															?
														</p>
														<p className="text-sm">
															Estimated transfer size:{" "}
															{formatBytes(scanResult.totalSizeBytes)}
														</p>
														{totalConflicts > 0 && (
															<p className="text-sm text-orange-500">
																{totalConflicts} conflict(s) will be handled
																according to your choices.
															</p>
														)}
														<p className="text-sm text-orange-500">
															The service will be unavailable during transfer.
															Please deploy on the target server after completion.
														</p>
														{hasDomainCertificateFlow && (
															<p className="text-sm text-orange-500">
																If this service has domains, update DNS A/AAAA
																records to the target server after transfer.
																TLS certificates are not migrated and will be
																re-issued on the target after DNS propagation.
															</p>
														)}
													</div>
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>Cancel</AlertDialogCancel>
												<Button onClick={startTransfer}>
													Yes, transfer service
												</Button>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</div>
							</div>
						)}

						{/* Step 4: Transferring with real-time logs */}
						{step === "transferring" && (
							<div className="flex flex-col gap-3 py-4">
								<div className="flex items-center gap-2">
									<Loader2 className="h-5 w-5 animate-spin" />
									<span className="text-sm font-medium">
										{progress?.phase || "Starting transfer..."}
									</span>
								</div>

								<Progress
									value={progress?.percentage ?? 0}
									className="h-2"
								/>

								{progress && (
									<div className="flex justify-between text-xs text-muted-foreground">
										<span>
											{progress.processedFiles} / {progress.totalFiles} files
										</span>
										<span>
											{formatBytes(progress.transferredBytes)} /{" "}
											{formatBytes(progress.totalBytes)}
										</span>
										<span>{progress.percentage}%</span>
									</div>
								)}

								{progress?.currentFile && (
									<p className="text-xs font-mono text-muted-foreground truncate">
										{progress.currentFile}
									</p>
								)}

								{logs.length > 0 && (
									<ScrollArea className="h-32 rounded-md border p-2">
										<div className="flex flex-col gap-0.5">
											{logs.map((log, i) => (
												<p key={i} className="text-xs font-mono text-muted-foreground">
													{log}
												</p>
											))}
										</div>
									</ScrollArea>
								)}

								<p className="text-xs text-muted-foreground">
									Do not close this page during transfer.
								</p>
							</div>
						)}

						{/* Step 5: Done */}
						{step === "done" && (
							<div className="flex flex-col gap-3 py-4">
								<div className="flex items-center gap-2 text-green-600 dark:text-green-400">
									<CheckCircle2 className="h-5 w-5" />
									<span className="font-medium">
										Transfer completed successfully!
									</span>
								</div>
								<p className="text-sm text-muted-foreground">
									The service has been transferred to {getTargetServerName()}.
									You may need to deploy the service on the target server.
								</p>
								{hasDomainCertificateFlow && (
									<p className="text-xs text-muted-foreground">
										For domain services: update DNS A/AAAA to the target,
										wait for propagation, then open the HTTPS URL to trigger
										certificate issuance on target Traefik. If it still fails,
										redeploy the service or restart Traefik and retry.
									</p>
								)}
								<Button
									variant="outline"
									onClick={resetFlow}
									className="w-full"
								>
									Done
								</Button>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		) : null,
	};
};

// Per-service wrapper components that call the correct hooks at the top level

function ApplicationTransfer({
	id,
	currentServerId,
}: { id: string; currentServerId?: string | null }) {
	const scan = api.application.transferScan.useMutation();
	const inner = TransferInner({
		id,
		type: "application",
		currentServerId,
		scanFn: (input) => scan.mutateAsync(input as never),
		isScanning: scan.isLoading,
	});

	api.application.transferWithLogs.useSubscription(
		inner.subscriptionInput,
		{
			enabled: inner.isTransferring,
			onData: inner.handleSubscriptionData,
			onError: inner.handleSubscriptionError,
		},
	);

	return inner.render;
}

function ComposeTransfer({
	id,
	currentServerId,
}: { id: string; currentServerId?: string | null }) {
	const [scanInput, setScanInput] = useState<Record<string, unknown> | null>(null);
	const [isScanStreaming, setIsScanStreaming] = useState(false);
	const [scanStatusText, setScanStatusText] = useState<string>();
	const scanPromiseRef = useRef<{
		resolve: (value: unknown) => void;
		reject: (reason: Error) => void;
	} | null>(null);
	const inner = TransferInner({
		id,
		type: "compose",
		currentServerId,
		scanFn: (input) => {
			if (scanPromiseRef.current) {
				return Promise.reject(new Error("Scan already in progress"));
			}
			setScanInput(input);
			setIsScanStreaming(true);
			setScanStatusText("Preparing scan...");
			return new Promise((resolve, reject) => {
				scanPromiseRef.current = { resolve, reject };
			});
		},
		isScanning: isScanStreaming,
		scanStatusText,
	});

	api.compose.transferScanWithLogs.useSubscription(
		(scanInput || { composeId: id, targetServerId: null }) as never,
		{
			enabled: isScanStreaming && !!scanInput,
			onData: (data) => {
				try {
					const event = JSON.parse(data) as {
						type: "scan_progress" | "scan_complete" | "scan_error";
						payload?: unknown;
					};
					if (event.type === "scan_progress") {
						const payload = (event.payload || {}) as ScanProgress;
						const mountLabel = payload.mount ? ` (${payload.mount})` : "";
						const countsLabel =
							payload.totalMounts > 0
								? ` ${payload.processedMounts}/${payload.totalMounts}`
								: "";
						const fileLabel =
							payload.scannedFiles > 0 ? ` • ${payload.scannedFiles} files` : "";
						setScanStatusText(
							`${payload.phase || "Scanning"}${mountLabel}${countsLabel}${fileLabel}`,
						);
						return;
					}

					if (event.type === "scan_complete") {
						setIsScanStreaming(false);
						setScanInput(null);
						setScanStatusText(undefined);
						const pending = scanPromiseRef.current;
						scanPromiseRef.current = null;
						pending?.resolve(event.payload);
						return;
					}

					if (event.type === "scan_error") {
						const payload = (event.payload || {}) as { message?: string };
						const pending = scanPromiseRef.current;
						scanPromiseRef.current = null;
						setIsScanStreaming(false);
						setScanInput(null);
						setScanStatusText(undefined);
						pending?.reject(new Error(payload.message || "Scan failed"));
					}
				} catch {
					const pending = scanPromiseRef.current;
					scanPromiseRef.current = null;
					setIsScanStreaming(false);
					setScanInput(null);
					setScanStatusText(undefined);
					pending?.reject(new Error("Invalid scan response"));
				}
			},
			onError: (error) => {
				const pending = scanPromiseRef.current;
				scanPromiseRef.current = null;
				setIsScanStreaming(false);
				setScanInput(null);
				setScanStatusText(undefined);
				pending?.reject(
					new Error(error.message || "Scan stream disconnected unexpectedly"),
				);
			},
		},
	);

	api.compose.transferWithLogs.useSubscription(
		inner.subscriptionInput,
		{
			enabled: inner.isTransferring,
			onData: inner.handleSubscriptionData,
			onError: inner.handleSubscriptionError,
		},
	);

	return inner.render;
}

function PostgresTransfer({
	id,
	currentServerId,
}: { id: string; currentServerId?: string | null }) {
	const scan = api.postgres.transferScan.useMutation();
	const inner = TransferInner({
		id,
		type: "postgres",
		currentServerId,
		scanFn: (input) => scan.mutateAsync(input as never),
		isScanning: scan.isLoading,
	});

	api.postgres.transferWithLogs.useSubscription(
		inner.subscriptionInput,
		{
			enabled: inner.isTransferring,
			onData: inner.handleSubscriptionData,
			onError: inner.handleSubscriptionError,
		},
	);

	return inner.render;
}

function MysqlTransfer({
	id,
	currentServerId,
}: { id: string; currentServerId?: string | null }) {
	const scan = api.mysql.transferScan.useMutation();
	const inner = TransferInner({
		id,
		type: "mysql",
		currentServerId,
		scanFn: (input) => scan.mutateAsync(input as never),
		isScanning: scan.isLoading,
	});

	api.mysql.transferWithLogs.useSubscription(
		inner.subscriptionInput,
		{
			enabled: inner.isTransferring,
			onData: inner.handleSubscriptionData,
			onError: inner.handleSubscriptionError,
		},
	);

	return inner.render;
}

function MariadbTransfer({
	id,
	currentServerId,
}: { id: string; currentServerId?: string | null }) {
	const scan = api.mariadb.transferScan.useMutation();
	const inner = TransferInner({
		id,
		type: "mariadb",
		currentServerId,
		scanFn: (input) => scan.mutateAsync(input as never),
		isScanning: scan.isLoading,
	});

	api.mariadb.transferWithLogs.useSubscription(
		inner.subscriptionInput,
		{
			enabled: inner.isTransferring,
			onData: inner.handleSubscriptionData,
			onError: inner.handleSubscriptionError,
		},
	);

	return inner.render;
}

function MongoTransfer({
	id,
	currentServerId,
}: { id: string; currentServerId?: string | null }) {
	const scan = api.mongo.transferScan.useMutation();
	const inner = TransferInner({
		id,
		type: "mongo",
		currentServerId,
		scanFn: (input) => scan.mutateAsync(input as never),
		isScanning: scan.isLoading,
	});

	api.mongo.transferWithLogs.useSubscription(
		inner.subscriptionInput,
		{
			enabled: inner.isTransferring,
			onData: inner.handleSubscriptionData,
			onError: inner.handleSubscriptionError,
		},
	);

	return inner.render;
}

function RedisTransfer({
	id,
	currentServerId,
}: { id: string; currentServerId?: string | null }) {
	const scan = api.redis.transferScan.useMutation();
	const inner = TransferInner({
		id,
		type: "redis",
		currentServerId,
		scanFn: (input) => scan.mutateAsync(input as never),
		isScanning: scan.isLoading,
	});

	api.redis.transferWithLogs.useSubscription(
		inner.subscriptionInput,
		{
			enabled: inner.isTransferring,
			onData: inner.handleSubscriptionData,
			onError: inner.handleSubscriptionError,
		},
	);

	return inner.render;
}

export const TransferService = ({ id, type, currentServerId }: Props) => {
	switch (type) {
		case "application":
			return <ApplicationTransfer id={id} currentServerId={currentServerId} />;
		case "compose":
			return <ComposeTransfer id={id} currentServerId={currentServerId} />;
		case "postgres":
			return <PostgresTransfer id={id} currentServerId={currentServerId} />;
		case "mysql":
			return <MysqlTransfer id={id} currentServerId={currentServerId} />;
		case "mariadb":
			return <MariadbTransfer id={id} currentServerId={currentServerId} />;
		case "mongo":
			return <MongoTransfer id={id} currentServerId={currentServerId} />;
		case "redis":
			return <RedisTransfer id={id} currentServerId={currentServerId} />;
	}
};
