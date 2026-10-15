import { Progress } from "@/components/ui/progress";

interface TransferProgressProps {
	verb: "Export" | "Import";
	job?: { status: string; message?: string; error?: string };
	failed: boolean;
	done: boolean;
}

export const TransferProgress = ({
	verb,
	job,
	failed,
	done,
}: TransferProgressProps) => (
	<div className="space-y-2">
		<Progress value={done || failed ? 100 : job ? 60 : 20} />
		<p className="text-sm text-muted-foreground">
			{failed
				? `${verb} failed: ${job?.error}`
				: (job?.message ?? `Starting ${verb.toLowerCase()}...`)}
		</p>
	</div>
);
