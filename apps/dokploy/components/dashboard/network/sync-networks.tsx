import { AlertCircle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

export const SyncNetworks = () => {
	const [open, setOpen] = useState(false);
	const [syncResult, setSyncResult] = useState<{
		missing: string[];
		orphaned: string[];
	} | null>(null);
	const [silentSync, setSilentSync] = useState(false);

	const utils = api.useUtils();

	const { mutate: syncNetworks, isLoading } =
		api.network.syncNetworks.useMutation({
			onSuccess: (data) => {
				setSyncResult(data);

				if (!silentSync) {
					if (data.missing.length === 0 && data.orphaned.length === 0) {
						toast.success("Networks are in sync", {
							description: "All networks are properly synchronized with Docker",
						});
					} else {
						toast.warning("Sync issues detected", {
							description: `Found ${data.missing.length} missing and ${data.orphaned.length} orphaned networks`,
						});
					}
				}

				setSilentSync(false);
				utils.network.all.invalidate();
			},
			onError: (error) => {
				setSilentSync(false);
				toast.error("Sync failed", {
					description: error.message || "Failed to synchronize networks",
				});
			},
		});

	const { mutate: importOrphanedNetworks, isLoading: isImporting } =
		api.network.importOrphanedNetworks.useMutation({
			onSuccess: (data) => {
				const { imported, errors } = data;

				if (imported.length > 0) {
					toast.success(`Imported ${imported.length} network(s)`, {
						description: `Successfully imported: ${imported.map((n) => n.name).join(", ")}`,
					});
				}

				if (errors.length > 0) {
					toast.error(`Failed to import ${errors.length} network(s)`, {
						description: errors
							.map((e) => `${e.networkName}: ${e.error}`)
							.join(", "),
					});
				}

				// Re-run sync silently to update the results
				setSilentSync(true);
				syncNetworks({ serverId: null });
				utils.network.all.invalidate();
			},
			onError: (error) => {
				toast.error("Import failed", {
					description: error.message || "Failed to import orphaned networks",
				});
			},
		});

	const handleSync = () => {
		syncNetworks({ serverId: null });
	};

	const handleImportOrphaned = () => {
		importOrphanedNetworks({ serverId: null });
	};

	const handleClose = () => {
		setOpen(false);
		setSyncResult(null);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" className="gap-2">
					<RefreshCw className="h-4 w-4" />
					Sync Networks
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Synchronize Networks</DialogTitle>
					<DialogDescription>
						Check for inconsistencies between Dokploy database and Docker
						networks
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{!syncResult && (
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground">
								This will compare networks in the Dokploy database with Docker
								networks and identify any discrepancies:
							</p>
							<ul className="space-y-3 text-sm">
								<li className="flex items-start gap-2">
									<AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
									<div>
										<div className="font-medium">Missing Networks</div>
										<div className="text-muted-foreground text-xs">
											Networks in database but not in Docker
										</div>
									</div>
								</li>
								<li className="flex items-start gap-2">
									<AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
									<div>
										<div className="font-medium">Orphaned Networks</div>
										<div className="text-muted-foreground text-xs">
											Networks in Docker but not in database
										</div>
									</div>
								</li>
							</ul>
						</div>
					)}

					{syncResult && (
						<div className="space-y-4">
							{syncResult.missing.length === 0 &&
							syncResult.orphaned.length === 0 ? (
								<Alert>
									<CheckCircle2 className="h-4 w-4" />
									<AlertTitle>All synchronized</AlertTitle>
									<AlertDescription>
										All networks are properly synchronized between Dokploy and
										Docker
									</AlertDescription>
								</Alert>
							) : (
								<>
									{syncResult.missing.length > 0 && (
										<Alert variant="destructive">
											<AlertCircle className="h-4 w-4" />
											<AlertTitle>
												Missing Networks ({syncResult.missing.length})
											</AlertTitle>
											<AlertDescription className="mt-2">
												<p className="mb-2 text-sm">
													Networks in database but not in Docker:
												</p>
												<ul className="list-inside list-disc space-y-1 mb-3">
													{syncResult.missing.map((network) => (
														<li key={network} className="font-mono text-xs">
															{network}
														</li>
													))}
												</ul>
												<p className="text-xs text-muted-foreground">
													Delete from Dokploy or recreate in Docker
												</p>
											</AlertDescription>
										</Alert>
									)}

									{syncResult.orphaned.length > 0 && (
										<Alert>
											<AlertCircle className="h-4 w-4" />
											<AlertTitle>
												Orphaned Networks ({syncResult.orphaned.length})
											</AlertTitle>
											<AlertDescription className="mt-2">
												<p className="mb-2 text-sm">
													Networks in Docker but not in database:
												</p>
												<ul className="list-inside list-disc space-y-1 mb-3">
													{syncResult.orphaned.map((network) => (
														<li key={network} className="font-mono text-xs">
															{network}
														</li>
													))}
												</ul>
												<div className="flex items-center justify-end gap-2">
													<Button
														size="sm"
														onClick={handleImportOrphaned}
														disabled={isImporting}
														className="gap-2"
													>
														{isImporting ? (
															<>
																<RefreshCw className="h-3 w-3 animate-spin" />
																Importing...
															</>
														) : (
															<>
																<Download className="h-3 w-3" />
																Import All
															</>
														)}
													</Button>
												</div>
											</AlertDescription>
										</Alert>
									)}
								</>
							)}
						</div>
					)}

					<div className="flex justify-end gap-2">
						{syncResult ? (
							<Button onClick={handleClose} variant="outline">
								Close
							</Button>
						) : (
							<>
								<Button onClick={handleClose} variant="outline">
									Cancel
								</Button>
								<Button onClick={handleSync} disabled={isLoading}>
									{isLoading ? (
										<>
											<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
											Syncing...
										</>
									) : (
										<>
											<RefreshCw className="mr-2 h-4 w-4" />
											Run Sync
										</>
									)}
								</Button>
							</>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
