import { History } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { DateTooltip } from "@/components/shared/date-tooltip";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { FULLSCREEN_DIALOG_CLASS } from "./fullscreen-dialog";

interface Props {
	applicationId: string;
	currentVersion: number;
}

const PlanDialog = ({
	applicationId,
	testPlanHistoryId,
	onClose,
}: {
	applicationId: string;
	testPlanHistoryId: string | null;
	onClose: () => void;
}) => {
	const { data, error, isLoading } =
		api.application.testPlanHistoryEntry.useQuery(
			{ applicationId, testPlanHistoryId: testPlanHistoryId ?? "" },
			{ enabled: !!testPlanHistoryId, retry: false },
		);
	return (
		<Dialog
			open={!!testPlanHistoryId}
			onOpenChange={(open) => !open && onClose()}
		>
			<DialogContent className={FULLSCREEN_DIALOG_CLASS}>
				<DialogHeader>
					<DialogTitle>
						Test plan {data ? `v${data.version}` : ""}
						{data?.branch ? ` · ${data.branch}` : ""}
					</DialogTitle>
					<DialogDescription>
						{data
							? `Generated ${new Date(data.createdAt).toLocaleString()}${
									data.commitSha
										? ` for commit ${data.commitSha.slice(0, 12)}`
										: ""
								}`
							: "A test plan the QC service produced earlier."}
					</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-4">
					{isLoading && (
						<p className="text-sm text-muted-foreground">Loading the plan…</p>
					)}
					{error && <p className="text-sm text-destructive">{error.message}</p>}
					{data && (
						<div className="prose prose-sm dark:prose-invert max-w-none">
							<ReactMarkdown>{data.content}</ReactMarkdown>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};

// Earlier versions of the plan, kept so they can be read after being replaced.
export const ShowTestPlanHistory = ({
	applicationId,
	currentVersion,
}: Props) => {
	const [open, setOpen] = useState<string | null>(null);
	const { data } = api.application.testPlanHistory.useQuery(
		{ applicationId },
		{ enabled: !!applicationId },
	);

	if (!data || data.length === 0) {
		return null;
	}
	const branches = new Set(data.map((entry) => entry.branch));

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<History className="size-5" />
					History
				</CardTitle>
				<CardDescription>
					Every plan the QC service generated for this application. Open one to
					read it as it was.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{data.map((entry) => (
					<div
						key={entry.testPlanHistoryId}
						className="flex flex-row items-center justify-between gap-3 rounded-lg border p-3"
					>
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<Badge variant="outline">v{entry.version}</Badge>
							{entry.version === currentVersion && <Badge>current</Badge>}
							{branches.size > 1 && (
								<span className="text-muted-foreground">{entry.branch}</span>
							)}
							{entry.commitSha && (
								<code className="text-xs text-muted-foreground">
									{entry.commitSha.slice(0, 12)}
								</code>
							)}
							<DateTooltip date={entry.createdAt} />
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setOpen(entry.testPlanHistoryId)}
						>
							View
						</Button>
					</div>
				))}
			</CardContent>
			<PlanDialog
				applicationId={applicationId}
				testPlanHistoryId={open}
				onClose={() => setOpen(null)}
			/>
		</Card>
	);
};
