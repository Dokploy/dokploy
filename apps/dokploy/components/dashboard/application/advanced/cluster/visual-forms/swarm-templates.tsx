import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";

interface SwarmTemplatesProps {
	form: UseFormReturn<any>;
}

const TEMPLATES = {
	basic: {
		name: "Basic Configuration",
		description: "Simple replicated service with health checks",
		config: {
			modeSwarm: JSON.stringify({ Replicated: { Replicas: 2 } }, null, 2),
			healthCheckSwarm: JSON.stringify(
				{
					Test: ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
					Interval: 30000,
					Timeout: 10000,
					StartPeriod: 60000,
					Retries: 3,
				},
				null,
				2,
			),
			restartPolicySwarm: JSON.stringify(
				{
					Condition: "on-failure",
					Delay: 5000,
					MaxAttempts: 3,
				},
				null,
				2,
			),
			updateConfigSwarm: JSON.stringify(
				{
					Parallelism: 1,
					Delay: 10000,
					FailureAction: "pause",
					Order: "start-first",
				},
				null,
				2,
			),
		},
	},
	highAvailability: {
		name: "High Availability",
		description: "Multi-replica setup with rolling updates",
		config: {
			modeSwarm: JSON.stringify({ Replicated: { Replicas: 5 } }, null, 2),
			healthCheckSwarm: JSON.stringify(
				{
					Test: ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
					Interval: 10000,
					Timeout: 5000,
					StartPeriod: 30000,
					Retries: 3,
				},
				null,
				2,
			),
			restartPolicySwarm: JSON.stringify(
				{
					Condition: "any",
					Delay: 5000,
				},
				null,
				2,
			),
			updateConfigSwarm: JSON.stringify(
				{
					Parallelism: 2,
					Delay: 5000,
					FailureAction: "rollback",
					Monitor: 60000,
					MaxFailureRatio: 0.1,
					Order: "start-first",
				},
				null,
				2,
			),
			rollbackConfigSwarm: JSON.stringify(
				{
					Parallelism: 1,
					Delay: 5000,
					FailureAction: "pause",
					Order: "stop-first",
				},
				null,
				2,
			),
			placementSwarm: JSON.stringify(
				{
					Constraints: ["node.role==worker"],
					MaxReplicas: 10,
				},
				null,
				2,
			),
		},
	},
	global: {
		name: "Global Service",
		description: "One instance per node (global mode)",
		config: {
			modeSwarm: JSON.stringify({ Global: {} }, null, 2),
			healthCheckSwarm: JSON.stringify(
				{
					Test: ["CMD-SHELL", "exit 0"],
					Interval: 30000,
					Timeout: 10000,
					Retries: 3,
				},
				null,
				2,
			),
			restartPolicySwarm: JSON.stringify(
				{
					Condition: "on-failure",
					Delay: 10000,
				},
				null,
				2,
			),
		},
	},
	job: {
		name: "Replicated Job",
		description: "One-time or scheduled job execution",
		config: {
			modeSwarm: JSON.stringify(
				{
					ReplicatedJob: {
						MaxConcurrent: 3,
						TotalCompletions: 10,
					},
				},
				null,
				2,
			),
			restartPolicySwarm: JSON.stringify(
				{
					Condition: "on-failure",
					Delay: 5000,
					MaxAttempts: 2,
				},
				null,
				2,
			),
		},
	},
};

export const SwarmTemplates = ({ form }: SwarmTemplatesProps) => {
	const applyTemplate = (templateKey: keyof typeof TEMPLATES) => {
		const template = TEMPLATES[templateKey];
		Object.entries(template.config).forEach(([key, value]) => {
			form.setValue(key, value);
		});
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button type="button" variant="outline" size="sm" className="gap-2">
					<Sparkles className="h-4 w-4" />
					Load Template
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Swarm Configuration Templates</DialogTitle>
					<DialogDescription>
						Select a template to quickly apply common Docker Swarm configurations
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					{Object.entries(TEMPLATES).map(([key, template]) => (
						<div
							key={key}
							className="flex items-start justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
						>
							<div className="flex-1">
								<h4 className="font-semibold text-sm">{template.name}</h4>
								<p className="text-sm text-muted-foreground mt-1">
									{template.description}
								</p>
							</div>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={() => applyTemplate(key as keyof typeof TEMPLATES)}
							>
								Apply
							</Button>
						</div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
};

