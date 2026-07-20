import type { CaddyMigrationReport } from "@dokploy/server";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
}

const statusLabel = (report: CaddyMigrationReport) => {
	if (report.summary.blockingWarnings > 0) {
		return "Blocked";
	}
	if (report.validation.status !== "passed") {
		return "Validation required";
	}
	return "Ready";
};

export const CaddyMigrationPanel = ({ serverId }: Props) => {
	const [migrationId, setMigrationId] = useState<string | null>(null);
	const [maintenanceConfirmed, setMaintenanceConfirmed] = useState(false);

	const { data: activeProvider } =
		api.settings.getActiveWebServerProvider.useQuery({ serverId });
	const utils = api.useUtils();
	const { mutateAsync: prepareMigration, isPending: isPreparing } =
		api.settings.prepareCaddyMigration.useMutation();
	const { mutateAsync: applyMigration, isPending: isApplying } =
		api.settings.applyCaddyMigration.useMutation();
	const { mutateAsync: rollbackMigration, isPending: isRollingBack } =
		api.settings.rollbackCaddyMigration.useMutation();
	const { data: fetchedReport, refetch: refetchReport } =
		api.settings.getCaddyMigrationReport.useQuery(
			{ migrationId: migrationId ?? "", serverId },
			{ enabled: !!migrationId },
		);
	const [preparedReport, setPreparedReport] =
		useState<CaddyMigrationReport | null>(null);
	const report = fetchedReport ?? preparedReport;
	const blockingWarnings = report?.warnings.filter(
		(warning) => warning.blocking,
	);
	const nonBlockingWarnings = report?.warnings.filter(
		(warning) => !warning.blocking,
	);
	const isMutating = isPreparing || isApplying || isRollingBack;
	const canApply =
		!!report &&
		report.summary.blockingWarnings === 0 &&
		report.validation.status === "passed" &&
		maintenanceConfirmed &&
		!isMutating;
	const canRollback = !!report && report.status !== "prepared" && !isMutating;

	const handleDryRun = async () => {
		try {
			const nextReport = await prepareMigration({ serverId });
			setPreparedReport(nextReport);
			setMigrationId(nextReport.migrationId);
			setMaintenanceConfirmed(false);
			toast.success("Caddy migration dry run prepared");
		} catch (error) {
			toast.error(
				(error as Error).message || "Error preparing Caddy migration",
			);
		}
	};

	const handleApply = async () => {
		if (!report) return;
		try {
			await applyMigration({
				migrationId: report.migrationId,
				serverId,
				confirmMaintenanceWindow: true,
			});
			toast.success("Caddy migration apply started");
			await utils.settings.getActiveWebServerProvider.invalidate({ serverId });
			await refetchReport();
		} catch (error) {
			toast.error((error as Error).message || "Error applying Caddy migration");
		}
	};

	const handleRollback = async () => {
		if (!report) return;
		try {
			await rollbackMigration({ migrationId: report.migrationId, serverId });
			toast.success("Caddy rollback started");
			await utils.settings.getActiveWebServerProvider.invalidate({ serverId });
			await refetchReport();
		} catch (error) {
			toast.error(
				(error as Error).message || "Error rolling back Caddy migration",
			);
		}
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="pb-3">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<CardTitle className="text-base">Caddy migration</CardTitle>
						<CardDescription>
							Prepare a reviewable Traefik → Caddy migration before any
							maintenance-window cutover.
						</CardDescription>
					</div>
					<Button
						variant="secondary"
						onClick={() => void handleDryRun()}
						isLoading={isPreparing}
						disabled={isMutating}
					>
						Dry-run migration
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{activeProvider === "caddy" && (
					<AlertBlock type="success">
						Caddy is already the active provider. Dry runs are still useful for
						reviewing translated Traefik artifacts before rollback or follow-up
						changes.
					</AlertBlock>
				)}

				{isPreparing && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" /> Preparing migration
						artifacts...
					</div>
				)}

				{report && (
					<div className="space-y-4 rounded-lg border p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="space-y-1">
								<div className="flex items-center gap-2">
									<span className="font-medium">
										Dry run {report.migrationId}
									</span>
									<Badge
										variant={
											report.summary.blockingWarnings > 0
												? "destructive"
												: "secondary"
										}
									>
										{statusLabel(report)}
									</Badge>
								</div>
								<p className="text-xs text-muted-foreground">
									Created {new Date(report.createdAt).toLocaleString()} ·
									Status: {report.status} · Validation:{" "}
									{report.validation.status}
								</p>
							</div>
							<div className="grid grid-cols-3 gap-2 text-center text-xs">
								<div className="rounded-md bg-muted p-2">
									<div className="font-medium">{report.summary.fragments}</div>
									<div className="text-muted-foreground">Fragments</div>
								</div>
								<div className="rounded-md bg-muted p-2">
									<div className="font-medium">{report.summary.routes}</div>
									<div className="text-muted-foreground">Routes</div>
								</div>
								<div className="rounded-md bg-muted p-2">
									<div className="font-medium">
										{report.summary.blockingWarnings}/{report.summary.warnings}
									</div>
									<div className="text-muted-foreground">Blocking</div>
								</div>
							</div>
						</div>

						{report.validation.message && (
							<AlertBlock
								type={
									report.validation.status === "passed" ? "success" : "warning"
								}
							>
								{report.validation.message}
							</AlertBlock>
						)}

						<div className="grid gap-3 text-sm md:grid-cols-2">
							<div>
								<div className="font-medium">Inputs</div>
								<ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
									<li>
										Traefik static config:{" "}
										{report.inputs.traefikStaticConfigFound
											? "found"
											: "not found"}
									</li>
									<li>Dynamic files: {report.inputs.dynamicFiles.length}</li>
									<li>
										Application domains: {report.inputs.dbApplicationDomains}
									</li>
									<li>Compose domains: {report.inputs.dbComposeDomains}</li>
								</ul>
							</div>
							<div>
								<div className="font-medium">Artifacts</div>
								<ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground [overflow-wrap:anywhere]">
									<li>Report: {report.artifactPaths.reportMd}</li>
									<li>Draft Caddy JSON: {report.artifactPaths.caddyJson}</li>
									<li>Fragments: {report.artifactPaths.fragmentsDir}</li>
								</ul>
							</div>
						</div>

						{blockingWarnings && blockingWarnings.length > 0 ? (
							<AlertBlock type="error">
								<div className="space-y-2">
									<div className="font-medium">Blocking items</div>
									<ul className="list-disc space-y-1 pl-5">
										{blockingWarnings.map((warning, index) => (
											<li key={`${warning.code}-${index}`}>
												{warning.source ? `${warning.source}: ` : ""}
												{warning.message}
											</li>
										))}
									</ul>
								</div>
							</AlertBlock>
						) : (
							<AlertBlock
								type="success"
								icon={<CheckCircle2 className="size-5" />}
							>
								No blocking migration items were reported.
							</AlertBlock>
						)}

						{nonBlockingWarnings && nonBlockingWarnings.length > 0 && (
							<details className="rounded-md border p-3 text-sm">
								<summary className="cursor-pointer font-medium">
									Review non-blocking warnings ({nonBlockingWarnings.length})
								</summary>
								<ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
									{nonBlockingWarnings.map((warning, index) => (
										<li key={`${warning.code}-${index}`}>
											{warning.source ? `${warning.source}: ` : ""}
											{warning.message}
										</li>
									))}
								</ul>
							</details>
						)}

						<div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3">
							<div className="flex items-start gap-3">
								<AlertTriangle className="mt-0.5 size-4 text-orange-500" />
								<div className="space-y-3">
									<p className="text-sm">
										Apply stops Traefik, starts Caddy on ports 80/443/443 UDP,
										and changes the active provider only after cutover checks
										pass. Run this during a maintenance window. Changing Caddy
										settings after a dry run requires preparing a fresh dry run.
									</p>
									<div className="flex items-center gap-2">
										<Checkbox
											id="confirm-caddy-maintenance-window"
											checked={maintenanceConfirmed}
											onCheckedChange={(checked) =>
												setMaintenanceConfirmed(checked === true)
											}
										/>
										<Label
											htmlFor="confirm-caddy-maintenance-window"
											className="cursor-pointer text-sm font-normal"
										>
											I am in a maintenance window and approve the cutover.
										</Label>
									</div>
								</div>
							</div>
						</div>

						<div className="flex flex-wrap justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => void handleRollback()}
								isLoading={isRollingBack}
								disabled={!canRollback}
							>
								<RotateCcw className="size-4" /> Roll back to Traefik
							</Button>
							<Button
								onClick={() => void handleApply()}
								isLoading={isApplying}
								disabled={!canApply}
							>
								Apply Caddy cutover
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
