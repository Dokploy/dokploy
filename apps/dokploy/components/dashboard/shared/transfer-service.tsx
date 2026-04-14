import { AlertTriangle, ArrowRightLeft, Loader2, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

type ServiceType =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis";

interface TransferServiceProps {
	serviceId: string;
	serviceType: ServiceType;
	currentServerId: string | null;
}

interface ScanResult {
	serviceDirectory: {
		files: Array<{
			path: string;
			status: string;
			sourceFile: { path: string; size: number; modifiedAt: number };
			targetFile?: { path: string; size: number; modifiedAt: number };
		}>;
		totalSize: number;
	};
	traefikConfig: {
		exists: boolean;
		hasConflict: boolean;
	};
	mounts: Array<{
		mount: {
			mountId: string;
			type: string;
			volumeName?: string | null;
			hostPath?: string | null;
			mountPath: string;
		};
		files: Array<{
			path: string;
			status: string;
		}>;
		totalSize: number;
	}>;
	totalTransferSize: number;
	totalFiles: number;
	conflicts: Array<{
		path: string;
		status: string;
	}>;
}

const formatBytes = (bytes: number): string => {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

const useTransferMutations = (serviceType: ServiceType) => {
	const appScan = api.application.transferScan.useMutation();
	const appTransfer = api.application.transfer.useMutation();
	const composeScan = api.compose.transferScan.useMutation();
	const composeTransfer = api.compose.transfer.useMutation();
	const postgresScan = api.postgres.transferScan.useMutation();
	const postgresTransfer = api.postgres.transfer.useMutation();
	const mysqlScan = api.mysql.transferScan.useMutation();
	const mysqlTransfer = api.mysql.transfer.useMutation();
	const mariadbScan = api.mariadb.transferScan.useMutation();
	const mariadbTransfer = api.mariadb.transfer.useMutation();
	const mongoScan = api.mongo.transferScan.useMutation();
	const mongoTransfer = api.mongo.transfer.useMutation();
	const redisScan = api.redis.transferScan.useMutation();
	const redisTransfer = api.redis.transfer.useMutation();

	const mutations: Record<
		ServiceType,
		{
			scan: { mutateAsync: (input: any) => Promise<any>; isPending: boolean };
			transfer: {
				mutateAsync: (input: any) => Promise<any>;
				isPending: boolean;
			};
		}
	> = {
		application: { scan: appScan, transfer: appTransfer },
		compose: { scan: composeScan, transfer: composeTransfer },
		postgres: { scan: postgresScan, transfer: postgresTransfer },
		mysql: { scan: mysqlScan, transfer: mysqlTransfer },
		mariadb: { scan: mariadbScan, transfer: mariadbTransfer },
		mongo: { scan: mongoScan, transfer: mongoTransfer },
		redis: { scan: redisScan, transfer: redisTransfer },
	};

	return mutations[serviceType];
};

const getServiceIdKey = (serviceType: ServiceType): string => {
	const map: Record<ServiceType, string> = {
		application: "applicationId",
		compose: "composeId",
		postgres: "postgresId",
		mysql: "mysqlId",
		mariadb: "mariadbId",
		mongo: "mongoId",
		redis: "redisId",
	};
	return map[serviceType];
};

export const TransferService = ({
	serviceId,
	serviceType,
	currentServerId,
}: TransferServiceProps) => {
	const [targetServerId, setTargetServerId] = useState<string>("");
	const [scanResult, setScanResult] = useState<ScanResult | null>(null);
	const [step, setStep] = useState<"select" | "scan" | "confirm" | "transfer">(
		"select",
	);
	const [showConfirm, setShowConfirm] = useState(false);
	const [transferLogs, setTransferLogs] = useState<string[]>([]);

	const { data: servers } = api.server.all.useQuery();
	const utils = api.useUtils();
	const { scan, transfer } = useTransferMutations(serviceType);

	const idKey = getServiceIdKey(serviceType);

	const availableServers = servers?.filter(
		(s) => s.serverId !== currentServerId,
	);

	const selectedServer = servers?.find((s) => s.serverId === targetServerId);

	const handleScan = async () => {
		if (!targetServerId) {
			toast.error("Please select a target server");
			return;
		}

		setStep("scan");
		try {
			const result = await scan.mutateAsync({
				[idKey]: serviceId,
				targetServerId,
			});
			setScanResult(result as ScanResult);
			setStep("confirm");
		} catch (error) {
			toast.error(
				`Scan failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			setStep("select");
		}
	};

	const handleTransfer = async () => {
		setShowConfirm(false);
		setStep("transfer");
		setTransferLogs([]);

		try {
			await transfer.mutateAsync({
				[idKey]: serviceId,
				targetServerId,
				decisions: {},
			});

			toast.success("Transfer completed successfully!");
			setTransferLogs((prev) => [...prev, "Transfer completed successfully!"]);

			await utils.invalidate();

			setTimeout(() => {
				setStep("select");
				setScanResult(null);
				setTargetServerId("");
			}, 3000);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown error";
			toast.error(`Transfer failed: ${message}`);
			setTransferLogs((prev) => [...prev, `Transfer failed: ${message}`]);
			setStep("confirm");
		}
	};

	const isDbService = ["postgres", "mysql", "mariadb", "mongo", "redis"].includes(
		serviceType,
	);

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<ArrowRightLeft className="size-5" />
					Transfer Service
				</CardTitle>
				<CardDescription>
					Transfer this {serviceType} service to a different server. Source data
					is never modified or deleted.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{!availableServers?.length ? (
					<div className="flex items-center gap-2 text-muted-foreground">
						<Server className="size-4" />
						<span>
							No other servers available. Add a remote server first.
						</span>
					</div>
				) : (
					<>
						{/* Step 1: Select target server */}
						<div className="space-y-2">
							<label className="text-sm font-medium">Target Server</label>
							<Select
								value={targetServerId}
								onValueChange={(value) => {
									setTargetServerId(value);
									setScanResult(null);
									setStep("select");
								}}
								disabled={step === "transfer"}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select target server" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{availableServers.map((server) => (
											<SelectItem
												key={server.serverId}
												value={server.serverId}
											>
												<span className="flex items-center gap-2">
													<span>{server.name}</span>
													<span className="text-muted-foreground text-xs">
														{server.ipAddress}
													</span>
												</span>
											</SelectItem>
										))}
										<SelectLabel>
											Servers ({availableServers.length})
										</SelectLabel>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>

						{/* Scan button */}
						{step === "select" && targetServerId && (
							<Button
								onClick={handleScan}
								disabled={scan.isPending}
								variant="outline"
							>
								{scan.isPending ? (
									<>
										<Loader2 className="mr-2 size-4 animate-spin" />
										Scanning...
									</>
								) : (
									"Scan for Transfer"
								)}
							</Button>
						)}

						{/* Step 2: Scan in progress */}
						{step === "scan" && (
							<div className="flex items-center gap-2 text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								<span>
									Scanning source and target servers for files and
									conflicts...
								</span>
							</div>
						)}

						{/* Step 3: Scan results + confirm */}
						{step === "confirm" && scanResult && (
							<div className="space-y-4">
								<div className="rounded-lg border p-4 space-y-3">
									<h4 className="font-medium">Scan Results</h4>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div>
											<span className="text-muted-foreground">
												Total Files:
											</span>{" "}
											<span className="font-medium">
												{scanResult.totalFiles}
											</span>
										</div>
										<div>
											<span className="text-muted-foreground">
												Transfer Size:
											</span>{" "}
											<span className="font-medium">
												{formatBytes(scanResult.totalTransferSize)}
											</span>
										</div>
										<div>
											<span className="text-muted-foreground">
												Volumes/Mounts:
											</span>{" "}
											<span className="font-medium">
												{scanResult.mounts.length}
											</span>
										</div>
										<div>
											<span className="text-muted-foreground">
												Conflicts:
											</span>{" "}
											<Badge
												variant={
													scanResult.conflicts.length > 0
														? "destructive"
														: "secondary"
												}
											>
												{scanResult.conflicts.length}
											</Badge>
										</div>
									</div>
									{scanResult.traefikConfig.exists && (
										<div className="text-sm">
											<span className="text-muted-foreground">
												Traefik Config:
											</span>{" "}
											<Badge variant="outline">Will be synced</Badge>
										</div>
									)}
								</div>

								{/* Conflict list */}
								{scanResult.conflicts.length > 0 && (
									<div className="rounded-lg border p-4 space-y-2">
										<h4 className="font-medium text-sm">
											File Conflicts (will be overwritten)
										</h4>
										<div className="max-h-40 overflow-y-auto space-y-1">
											{scanResult.conflicts.map((conflict) => (
												<div
													key={conflict.path}
													className="text-xs font-mono flex items-center gap-2"
												>
													<Badge variant="outline" className="text-[10px]">
														{conflict.status}
													</Badge>
													<span className="truncate">
														{conflict.path}
													</span>
												</div>
											))}
										</div>
									</div>
								)}

								{/* Warning */}
								<div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 space-y-2">
									<div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
										<AlertTriangle className="size-4" />
										<span className="font-medium text-sm">
											Service Downtime Warning
										</span>
									</div>
									<p className="text-sm text-muted-foreground">
										{isDbService
											? "Stop the database service before transferring to avoid data corruption. The service will be unavailable until deployed on the target server."
											: "The service will be unavailable during transfer. After transfer completes, deploy the service on the target server to start it."}
									</p>
								</div>

								{/* Transfer button */}
								<div className="flex gap-2">
									<Button
										variant="outline"
										onClick={() => {
											setStep("select");
											setScanResult(null);
										}}
									>
										Cancel
									</Button>
									<Button
										onClick={() => setShowConfirm(true)}
										disabled={transfer.isPending}
									>
										<ArrowRightLeft className="mr-2 size-4" />
										Transfer to {selectedServer?.name}
									</Button>
								</div>
							</div>
						)}

						{/* Step 4: Transfer in progress */}
						{step === "transfer" && (
							<div className="space-y-4">
								<div className="flex items-center gap-2">
									<Loader2 className="size-4 animate-spin" />
									<span className="text-sm font-medium">
										Transferring service...
									</span>
								</div>
								{transferLogs.length > 0 && (
									<div className="rounded-lg border bg-muted/50 p-3 max-h-60 overflow-y-auto">
										{transferLogs.map((log, i) => (
											<div
												key={`${log}-${i}`}
												className="text-xs font-mono text-muted-foreground"
											>
												{log}
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</>
				)}

				{/* Confirmation dialog */}
				<AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Confirm Service Transfer</AlertDialogTitle>
							<AlertDialogDescription className="space-y-2">
								<p>
									You are about to transfer this {serviceType} to{" "}
									<strong>{selectedServer?.name}</strong> (
									{selectedServer?.ipAddress}).
								</p>
								{scanResult && (
									<p>
										{scanResult.totalFiles} files (
										{formatBytes(scanResult.totalTransferSize)}) will be
										copied.
									</p>
								)}
								<p className="text-yellow-600 dark:text-yellow-400 font-medium">
									The service will experience downtime during this
									process. After transfer, you must deploy the service on
									the target server.
								</p>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={handleTransfer}>
								Confirm Transfer
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
};
