"use client";
import type { AnalysisTarget } from "@dokploy/server/utils/ai/log-analysis-schema";
import copy from "copy-to-clipboard";
import {
	Bot,
	Check,
	Copy,
	Loader2,
	RotateCcw,
	Settings,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import type { LogLine } from "./utils";

interface Props {
	logs: LogLine[];
	context: "build" | "runtime";
	target?: AnalysisTarget;
}

export function AnalyzeLogs({ logs, context, target }: Props) {
	const [open, setOpen] = useState(false);
	const [aiId, setAiId] = useState<string>("");
	const [copied, setCopied] = useState(false);
	const { data: providers } = api.ai.getEnabledProviders.useQuery(undefined, {
		enabled: open,
	});
	const {
		mutate,
		isPending,
		data: analysisResult,
		variables,
		reset,
	} = api.ai.analyzeLogs.useMutation({
		onError: (error) => {
			toast.error("Analysis failed", {
				description: error.message,
			});
		},
	});

	const selectedProvider = providers?.find(
		(provider) => provider.aiId === aiId,
	);
	const lineLimit = selectedProvider?.logLineLimit ?? 200;
	const targetKey = JSON.stringify(target);
	const data =
		variables?.aiId === aiId && JSON.stringify(variables.target) === targetKey
			? analysisResult
			: undefined;
	useEffect(() => {
		reset();
	}, [targetKey, aiId, reset]);

	const handleAnalyze = () => {
		if (!aiId || (!target && logs.length === 0)) return;

		const logsText = logs
			.slice(-lineLimit)
			.map((l) => l.message)
			.join("\n");

		mutate({ aiId, ...(target ? { target } : { logs: logsText }), context });
	};

	const handleCopy = () => {
		if (!data?.analysis) return;
		const success = copy(data.analysis);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<Popover
			open={open}
			onOpenChange={(isOpen) => {
				setOpen(isOpen);
				if (!isOpen) {
					reset();
					setAiId("");
				}
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-9"
					disabled={!target && logs.length === 0}
					title="Analyze logs with AI"
				>
					<Bot className="mr-2 size-4" />
					AI
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[550px] p-0" align="end">
				<div className="flex items-center justify-between border-b px-4 py-3">
					<div className="flex items-center gap-2">
						<Bot className="h-4 w-4" />
						<span className="text-sm font-medium">Log Analysis</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6"
						onClick={() => setOpen(false)}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
				<div className="p-4 space-y-3">
					{!data?.analysis ? (
						providers && providers.length === 0 ? (
							<div className="flex flex-col items-center gap-3 py-2 text-center">
								<p className="text-sm text-muted-foreground">
									No AI providers configured. Set up a provider to start
									analyzing logs.
								</p>
								<Button size="sm" variant="outline" asChild>
									<Link href="/dashboard/settings/ai">
										<Settings className="mr-2 h-3.5 w-3.5" />
										Configure AI Provider
									</Link>
								</Button>
							</div>
						) : (
							<>
								<Select value={aiId} onValueChange={setAiId}>
									<SelectTrigger className="h-9 text-sm">
										<SelectValue placeholder="Select AI provider..." />
									</SelectTrigger>
									<SelectContent>
										{providers?.map((p) => (
											<SelectItem key={p.aiId} value={p.aiId}>
												{p.name} ({p.model})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									{target
										? "Fetches recent logs independently of viewer filters and loaded lines."
										: "Uses the currently loaded logs. Source inspection is unavailable without a service target."}
									{selectedProvider?.enableCodeInspection && target
										? " Relevant source files may be sent to this provider."
										: ""}
								</p>
								<Button
									size="sm"
									className="w-full"
									disabled={
										!aiId || isPending || (!target && logs.length === 0)
									}
									onClick={handleAnalyze}
								>
									{isPending ? (
										<>
											<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
											Analyzing...
										</>
									) : (
										<>
											<Bot className="mr-2 h-3.5 w-3.5" />
											Analyze{" "}
											{target
												? `latest ${lineLimit}`
												: Math.min(logs.length, lineLimit)}{" "}
											lines
										</>
									)}
								</Button>
							</>
						)
					) : (
						<>
							<p className="text-xs text-muted-foreground">
								{data.lineCount} log lines ·{" "}
								{data.sourceStatus === "inspected"
									? "Source inspected"
									: "Logs only"}
							</p>
							{data.notices.map((notice) => (
								<p key={notice} className="text-xs text-muted-foreground">
									{notice}
								</p>
							))}
							{data.inspectedFiles.length > 0 && (
								<details className="text-xs">
									<summary>
										Inspected files ({data.inspectedFiles.length})
									</summary>
									<ul className="pl-4 list-disc">
										{data.inspectedFiles.map((file) => (
											<li key={file}>{file}</li>
										))}
									</ul>
								</details>
							)}
							<div className="max-h-[400px] overflow-y-auto">
								<div className="prose prose-sm dark:prose-invert max-w-none text-sm wrap-break-word">
									<ReactMarkdown>{data.analysis}</ReactMarkdown>
								</div>
							</div>
							<div className="flex gap-2">
								<Button
									size="sm"
									variant="outline"
									className="flex-1"
									onClick={() => {
										reset();
										handleAnalyze();
									}}
									disabled={isPending}
								>
									{isPending ? (
										<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
									) : (
										<RotateCcw className="mr-2 h-3.5 w-3.5" />
									)}
									Re-analyze
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={handleCopy}
									title="Copy analysis to clipboard"
								>
									{copied ? (
										<Check className="h-3.5 w-3.5" />
									) : (
										<Copy className="h-3.5 w-3.5" />
									)}
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => {
										reset();
										setAiId("");
									}}
									title="Change provider"
								>
									<X className="h-3.5 w-3.5" />
								</Button>
							</div>
						</>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
