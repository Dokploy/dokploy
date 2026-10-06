import { Badge } from "@/components/ui/badge";

interface Props {
	deployment: {
		qcVerdict?: "skipped" | "ready" | "error" | null;
		testPlanVersionAtDeploy?: number | null;
		testExecStatus?: "skipped" | "passed" | "failed" | null;
		testExecSummary?: {
			source: "command" | "generated";
			headline?: string;
			passed?: number | null;
			failed?: number | null;
			skipped?: number | null;
			failures?: string[];
		} | null;
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

// The QC step's plan and the pre-deploy tests, as they went for one deployment.
export const QcDeploymentBadges = ({ deployment }: Props) => {
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

	const failures = testExecSummary?.failures?.length
		? `\n${testExecSummary.failures.join("\n")}`
		: "";
	const title = `${testExecSummary?.headline ?? ""}${failures}`.trim();

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
					variant={testExecStatus === "failed" ? "destructive" : "outline"}
					className="text-[10px]"
					title={title || undefined}
				>
					{testExecStatus === "skipped"
						? "Tests skipped"
						: `Tests ${
								countLabel(testExecSummary?.passed, testExecSummary?.failed) ??
								testExecStatus
							}`}
					{testExecSummary?.source === "generated" ? " (generated)" : ""}
				</Badge>
			)}
		</>
	);
};
