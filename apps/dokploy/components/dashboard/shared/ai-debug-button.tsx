import { Bot, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	serviceType: "application" | "compose";
	serviceId: string;
	error?: string;
	compact?: boolean;
}

export const AiDebugButton = ({ serviceType, serviceId, error, compact = false }: Props) => {
	const [showProviderSelect, setShowProviderSelect] = useState(false);
	const [selectedAiId, setSelectedAiId] = useState("");
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [analysis, setAnalysis] = useState<string>("");

	const { data: aiConfigs } = api.ai.getAll.useQuery();
	const { mutateAsync: analyzeError } = api.ai.analyzeDeploymentError.useMutation();

	const hasAiConfigured = aiConfigs && aiConfigs.length > 0;

	if (!hasAiConfigured) {
		return null;
	}

	const handleDebug = () => {
		if (aiConfigs.length === 1) {
			performAnalysis(aiConfigs[0].aiId);
		} else {
			setShowProviderSelect(true);
		}
	};

	const performAnalysis = async (aiId: string) => {
		setIsAnalyzing(true);
		try {
			const result = await analyzeError({
				serviceType,
				serviceId,
				error: error || "",
				aiId,
			});
			setAnalysis(result.analysis);
			setShowProviderSelect(false);
		} catch (err) {
			toast.error("Failed to analyze error with AI");
		} finally {
			setIsAnalyzing(false);
		}
	};

	if (compact) {
		return (
			<Button
				size="sm"
				variant="outline"
				onClick={handleDebug}
				disabled={!hasAiConfigured || isAnalyzing}
				className="h-8 px-2"
			>
				<Bot className="h-4 w-4" />
			</Button>
		);
	}

	return (
		<>
			<Button
				size="sm"
				variant="outline"
				onClick={handleDebug}
				disabled={!hasAiConfigured || isAnalyzing}
				className="flex items-center gap-2"
			>
				<Bot className="h-4 w-4" />
				Debug with AI
				{!hasAiConfigured && <Info className="h-3 w-3 text-muted-foreground" />}
			</Button>

			<Dialog open={showProviderSelect} onOpenChange={setShowProviderSelect}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Select AI Provider</DialogTitle>
						<DialogDescription>
							Choose which AI provider to use for error analysis:
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="ai-provider">AI Provider</Label>
							<Select value={selectedAiId} onValueChange={setSelectedAiId}>
								<SelectTrigger>
									<SelectValue placeholder="Select an AI provider" />
								</SelectTrigger>
								<SelectContent>
									{aiConfigs?.map((ai) => (
										<SelectItem key={ai.aiId} value={ai.aiId}>
											{ai.name} ({ai.model})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex gap-2">
							<Button
								variant="outline"
								onClick={() => setShowProviderSelect(false)}
								className="flex-1"
							>
								Cancel
							</Button>
							<Button
								onClick={() => selectedAiId && performAnalysis(selectedAiId)}
								disabled={!selectedAiId || isAnalyzing}
								className="flex-1"
							>
								{isAnalyzing ? "Analyzing..." : "Analyze"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={!!analysis} onOpenChange={() => setAnalysis("")}>
				<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Bot className="h-5 w-5" />
							AI Error Analysis
						</DialogTitle>
						<DialogDescription>
							Here's what the AI found about your deployment error:
						</DialogDescription>
					</DialogHeader>
					<div className="mt-4">
						<div className="prose prose-sm max-w-none dark:prose-invert">
							{analysis.split('\n').map((line, i) => (
								<p key={i} className="mb-2">{line}</p>
							))}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
};