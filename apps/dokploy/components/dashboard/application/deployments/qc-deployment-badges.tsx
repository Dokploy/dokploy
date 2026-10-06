import { FileText } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { FULLSCREEN_DIALOG_CLASS } from "../qc/fullscreen-dialog";

const CATEGORY_LABEL: Record<string, string> = {
	code_bug: "application bug",
	test_bug: "wrong test",
	flaky: "flaky",
	env: "environment",
	unclassified: "unclassified",
};

interface Summary {
	source: "command" | "generated";
	verdict?: string;
	headline?: string;
	passed?: number | null;
	failed?: number | null;
	skipped?: number | null;
	failures?: string[];
	categories?: Record<string, number>;
	details?: {
		name: string;
		category: string;
		reason?: string;
		suggestedFix?: string;
	}[];
}

interface Props {
	deployment: {
		deploymentId: string;
		qcRunId?: string | null;
		qcVerdict?: "skipped" | "ready" | "error" | null;
		testPlanVersionAtDeploy?: number | null;
		testExecStatus?: "skipped" | "passed" | "failed" | null;
		testExecSummary?: Summary | null;
	};
}

const countLabel = (passed?: number | null, failed?: number | null) => {
	if (passed == null || failed == null) {
		return null;
	}
	return failed > 0
		? `${failed}/${passed + failed} failed`
		: `${passed} passed`;
};

// Failing tests are listed with what the service's triage made of them, so
// "wrong test" and "application bug" can be told apart at a glance.
const describeFailures = (summary?: Summary | null) => {
	if (!summary) {
		return "";
	}
	const lines = summary.details?.length
		? summary.details.map(
				(d) =>
					`${d.name} — ${CATEGORY_LABEL[d.category] ?? d.category}${
						d.reason ? `: ${d.reason}` : ""
					}`,
			)
		: (summary.failures ?? []);
	return [summary.headline, ...lines].filter(Boolean).join("\n");
};

const ReportDialog = ({
	deploymentId,
	open,
	onOpenChange,
}: {
	deploymentId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const { data, error, isLoading } = api.deployment.qcReport.useQuery(
		{ deploymentId },
		{ enabled: open, retry: false },
	);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={FULLSCREEN_DIALOG_CLASS}>
				<DialogHeader>
					<DialogTitle>QC report</DialogTitle>
					<DialogDescription>
						Written by the QC service for this deployment's test plan and tests.
					</DialogDescription>
				</DialogHeader>
				{isLoading && (
					<p className="text-sm text-muted-foreground">Loading the report…</p>
				)}
				{error && <p className="text-sm text-destructive">{error.message}</p>}
				{data && (
					// An empty sandbox: the report is plain HTML and needs no script,
					// and nothing in it should ever reach the Dokploy page.
					<iframe
						title="QC report"
						sandbox=""
						srcDoc={data.html}
						className="w-full min-h-0 flex-1 rounded-md border bg-white"
					/>
				)}
			</DialogContent>
		</Dialog>
	);
};

// The QC step's plan and the pre-deploy tests, as they went for one deployment.
export const QcDeploymentBadges = ({ deployment }: Props) => {
	const [reportOpen, setReportOpen] = useState(false);
	const {
		qcVerdict,
		testPlanVersionAtDeploy,
		testExecStatus,
		testExecSummary,
	} = deployment;
	const showPlan = qcVerdict === "ready" || qcVerdict === "error";
	if (!showPlan && !testExecStatus) {
		return null;
	}

	// Failing tests that were judged not to be application bugs only warn.
	const warned =
		testExecStatus === "failed" && testExecSummary?.verdict === "warn";
	const title = describeFailures(testExecSummary);

	return (
		<>
			{showPlan && (
				<Badge
					variant={qcVerdict === "error" ? "destructive" : "outline"}
					className="text-[10px]"
					title={
						qcVerdict === "error"
							? "The QC service could not produce a test plan"
							: undefined
					}
				>
					{qcVerdict === "error"
						? "QC error"
						: `Plan v${testPlanVersionAtDeploy ?? "?"}`}
				</Badge>
			)}
			{testExecStatus && (
				<Badge
					variant={
						testExecStatus === "failed" && !warned ? "destructive" : "outline"
					}
					className={`text-[10px] ${warned ? "border-yellow-500 text-yellow-600" : ""}`}
					title={title || undefined}
				>
					{testExecStatus === "skipped"
						? "Tests skipped"
						: `Tests ${
								countLabel(testExecSummary?.passed, testExecSummary?.failed) ??
								testExecStatus
							}`}
					{warned ? " (not app bugs)" : ""}
					{testExecSummary?.source === "generated" ? " (generated)" : ""}
				</Badge>
			)}
			{deployment.qcRunId && testExecSummary?.source === "generated" && (
				<>
					<Button
						variant="ghost"
						size="sm"
						className="h-5 px-1 text-[10px] gap-1"
						onClick={() => setReportOpen(true)}
					>
						<FileText className="size-3" />
						Report
					</Button>
					<ReportDialog
						deploymentId={deployment.deploymentId}
						open={reportOpen}
						onOpenChange={setReportOpen}
					/>
				</>
			)}
		</>
	);
};
