import { RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { ShowTestPlanHistory } from "./show-test-plan-history";

interface Props {
	applicationId: string;
}

// Outer bound only: past this a "generating" row is assumed abandoned, so the
// UI stops polling and shows it as timed out (the server reclaims it on the
// next run).
const GENERATING_TIMEOUT_MS = 15 * 60 * 1000;

const isGeneratingTimedOut = (startedAt: string | null | undefined) =>
	!!startedAt && Date.now() - Date.parse(startedAt) > GENERATING_TIMEOUT_MS;

const statusVariant = {
	none: "outline",
	generating: "default",
	ready: "default",
	error: "destructive",
} as const;

export const ShowTestPlan = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery(
		{ applicationId },
		{
			enabled: !!applicationId,
			refetchInterval: (query) =>
				query.state.data?.testPlanStatus === "generating" &&
				!isGeneratingTimedOut(query.state.data.testPlanStartedAt)
					? 3000
					: false,
		},
	);

	const utils = api.useUtils();
	const previousStatus = useRef<string | undefined>(undefined);
	useEffect(() => {
		const status = data?.testPlanStatus;
		if (previousStatus.current === "generating") {
			if (status === "ready") {
				toast.success("Test plan updated");
				void utils.application.testPlanHistory.invalidate({ applicationId });
			} else if (status === "error") {
				toast.error(data?.testPlanError ?? "Error generating the test plan");
			}
		}
		previousStatus.current = status;
	}, [data?.testPlanStatus, data?.testPlanError, utils, applicationId]);

	const { mutateAsync, isPending } =
		api.application.regenerateTestPlan.useMutation();

	const onRegenerate = async () => {
		await mutateAsync({ applicationId })
			.then(async () => {
				toast.info("Test plan generation started");
				await refetch();
			})
			.catch((error) => {
				toast.error(error?.message ?? "Error regenerating the test plan");
			});
	};

	if (!data?.qcEnabled) {
		return (
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Test Plan</CardTitle>
					<CardDescription>
						Enable "QC test-plan step" in Advanced settings to have the QC
						service generate and maintain a test plan for this application.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	const timedOut =
		data.testPlanStatus === "generating" &&
		isGeneratingTimedOut(data.testPlanStartedAt);
	const status = timedOut ? "error" : (data.testPlanStatus ?? "none");
	const isGenerating = status === "generating";
	const errorMessage = timedOut
		? "Generation timed out. Click Regenerate to try again."
		: data.testPlanError;

	return (
		<div className="flex flex-col gap-4">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle className="text-xl flex items-center gap-2">
							Test Plan
							<Badge variant={statusVariant[status]}>{status}</Badge>
							{data.testPlanVersion ? (
								<span className="text-sm text-muted-foreground font-normal">
									v{data.testPlanVersion}
								</span>
							) : null}
						</CardTitle>
						<CardDescription>
							Generated/updated by the QC service on each deploy of this
							application.
						</CardDescription>
					</div>
					<Button
						variant="outline"
						size="sm"
						isLoading={isPending}
						disabled={isGenerating}
						onClick={onRegenerate}
					>
						<RefreshCw className="size-4 mr-2" />
						Regenerate
					</Button>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{errorMessage && !isGenerating ? (
						<p className="text-sm text-destructive">{errorMessage}</p>
					) : null}
					{data.testPlanContent ? (
						<div className="prose prose-sm dark:prose-invert max-w-none">
							<ReactMarkdown>{data.testPlanContent}</ReactMarkdown>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No test plan generated yet. It will be created on the next deploy,
							or click "Regenerate" to run it now.
						</p>
					)}
				</CardContent>
			</Card>
			<ShowTestPlanHistory
				applicationId={applicationId}
				currentVersion={data.testPlanVersion}
			/>
		</div>
	);
};
