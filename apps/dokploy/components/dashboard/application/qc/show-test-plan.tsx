import { RefreshCw } from "lucide-react";
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

interface Props {
	applicationId: string;
}

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
				query.state.data?.testPlanStatus === "generating" ? 3000 : false,
		},
	);

	const { mutateAsync, isPending } =
		api.application.regenerateTestPlan.useMutation();

	const onRegenerate = async () => {
		await mutateAsync({ applicationId })
			.then(async (result) => {
				if (result.verdict === "ready") {
					toast.success("Test plan updated");
				} else if (result.verdict === "skipped") {
					toast.info(result.reason ?? "Test plan step was skipped");
				} else {
					toast.error(result.reason ?? "Error regenerating the test plan");
				}
				await refetch();
			})
			.catch(() => {
				toast.error("Error regenerating the test plan");
			});
	};

	if (!data?.qcEnabled) {
		return (
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Test Plan</CardTitle>
					<CardDescription>
						Enable "QC test-plan step" in Advanced settings to have QC Agent
						generate and maintain a test plan for this application.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle className="text-xl flex items-center gap-2">
						Test Plan
						<Badge variant={statusVariant[data.testPlanStatus ?? "none"]}>
							{data.testPlanStatus ?? "none"}
						</Badge>
						{data.testPlanVersion ? (
							<span className="text-sm text-muted-foreground font-normal">
								v{data.testPlanVersion}
							</span>
						) : null}
					</CardTitle>
					<CardDescription>
						Generated/updated by QC Agent on each deploy of this application.
					</CardDescription>
				</div>
				<Button
					variant="outline"
					size="sm"
					isLoading={isPending}
					onClick={onRegenerate}
				>
					<RefreshCw className="size-4 mr-2" />
					Regenerate
				</Button>
			</CardHeader>
			<CardContent>
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
	);
};
