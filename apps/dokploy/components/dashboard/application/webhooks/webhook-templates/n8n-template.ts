import type {
	BaseWebhookContext,
	N8nWebhookPayload,
	N8nWebhookConfig,
	TemplateGenerator,
} from "./types";

export class N8nTemplateGenerator
	implements TemplateGenerator<N8nWebhookConfig>
{
	generate(
		context: BaseWebhookContext,
		config?: N8nWebhookConfig,
	): N8nWebhookPayload {
		const {
			event,
			timestamp,
			webhookId,
			deployment,
			entity,
			project,
			source,
			trigger,
			error,
		} = context;

		const payload: N8nWebhookPayload = {
			event,
			timestamp,
			webhookId,
			data: {
				// Deployment Information (flattened)
				deploymentId: deployment.deploymentId,
				deploymentStatus: deployment.status,
				deploymentStartedAt: deployment.startedAt,
				deploymentFinishedAt: deployment.finishedAt,
				deploymentDuration: deployment.duration,
				deploymentStage: deployment.stage,

				// Entity Information (flattened)
				entityType: entity.type,
				entityId: entity.id,
				entityName: entity.name,
				entityUrl: entity.url,
				entityDomains: entity.domains,

				// Project Information
				projectId: project.id,
				projectName: project.name,

				// Source Control (if applicable)
				sourceType: source?.type,
				sourceBranch: source?.branch,
				sourceCommit: source?.commit,
				sourceRepository: source?.repository,
				sourceCommitMessage: source?.commitMessage,
				sourceAuthor: source?.author,

				// Trigger Information
				triggerType: trigger.type,
				triggeredBy: trigger.triggeredBy,
				triggerSource: trigger.source,

				// Error Information (for failed deployments)
				errorMessage: error?.message,
				errorStage: error?.stage,
				errorCode: error?.code,
				errorLogs: this.processErrorLogs(error?.logs, config?.logLines),

				// Metadata for n8n workflow context
				metadata: {
					dokployVersion: process.env.DOKPLOY_VERSION || "1.0.0",
					environment: process.env.NODE_ENV,
					region: process.env.REGION,
					customFields: config?.customFields,
				},
			},
			n8n: {
				workflowRecommendation: this.getWorkflowRecommendation(event, error),
				retryable: this.isRetryable(error),
				priority: this.getPriority(event, error),
				tags: this.generateTags(context, config),
			},
		};

		// Apply filtering based on configuration
		if (config?.minimumSeverity && config.minimumSeverity !== "all") {
			if (!this.meetsSeverityThreshold(event, config.minimumSeverity)) {
				return payload;
			}
		}

		if (config?.branches && config.branches.length > 0) {
			if (!source?.branch || !config.branches.includes(source.branch)) {
				return payload;
			}
		}

		// Apply custom transformation if provided
		if (config?.transformScript) {
			try {
				const transform = new Function(
					"payload",
					"context",
					config.transformScript,
				);
				return transform(payload, context);
			} catch (e) {
				console.error("Failed to apply custom transformation:", e);
			}
		}

		return payload;
	}

	validate(payload: any): boolean {
		if (!payload || typeof payload !== "object") return false;

		// Check required top-level fields
		if (!payload.event || !payload.timestamp || !payload.data) return false;

		// Check data structure
		const { data } = payload;
		if (!data.deploymentId || !data.entityType || !data.entityId) return false;

		// Check n8n specific fields
		if (!payload.n8n || typeof payload.n8n !== "object") return false;
		if (!["low", "normal", "high"].includes(payload.n8n.priority)) return false;

		return true;
	}

	preview(context: BaseWebhookContext, config?: N8nWebhookConfig): string {
		const payload = this.generate(context, config);
		return JSON.stringify(payload, null, 2);
	}

	private processErrorLogs(
		logs?: string,
		maxLines?: number,
	): string | undefined {
		if (!logs) return undefined;

		const lines = logs.split("\n");
		const linesToInclude = maxLines || 50;

		if (lines.length <= linesToInclude) return logs;

		// Return last N lines
		return lines.slice(-linesToInclude).join("\n");
	}

	private getWorkflowRecommendation(event: string, error?: any): string {
		switch (event) {
			case "deployment.started":
				return "Monitor deployment progress and send notifications";
			case "deployment.success":
				return "Trigger post-deployment tasks, update monitoring dashboards";
			case "deployment.failed":
				if (error?.code === "BUILD_FAILED") {
					return "Notify developers, create issue ticket, trigger rollback if critical";
				}
				return "Alert team, analyze logs, trigger automated recovery";
			case "deployment.cancelled":
				return "Clean up resources, notify relevant stakeholders";
			default:
				return "Process event based on your workflow requirements";
		}
	}

	private isRetryable(error?: any): boolean {
		if (!error) return false;

		const nonRetryableErrors = [
			"INVALID_CONFIG",
			"AUTHENTICATION_FAILED",
			"RESOURCE_NOT_FOUND",
			"PERMISSION_DENIED",
		];

		return !nonRetryableErrors.includes(error.code);
	}

	private getPriority(event: string, error?: any): "low" | "normal" | "high" {
		if (event === "deployment.failed") {
			if (error?.stage === "production") return "high";
			return "normal";
		}

		if (event === "deployment.success") return "low";

		return "normal";
	}

	private generateTags(
		context: BaseWebhookContext,
		config?: N8nWebhookConfig,
	): string[] {
		const tags: string[] = [];

		// Add event type tag
		tags.push(context.event.replace(".", "-"));

		// Add entity type tag
		tags.push(context.entity.type);

		// Add environment tag if available
		if (process.env.NODE_ENV) {
			tags.push(process.env.NODE_ENV);
		}

		// Add branch tag if available
		if (context.source?.branch) {
			tags.push(`branch-${context.source.branch}`);
		}

		// Add trigger type
		tags.push(`trigger-${context.trigger.type}`);

		// Add error category if failed
		if (context.error) {
			tags.push("error");
			if (context.error.stage) {
				tags.push(`error-${context.error.stage}`);
			}
		}

		return tags;
	}

	private meetsSeverityThreshold(
		event: string,
		minimumSeverity: "warning" | "error",
	): boolean {
		if (minimumSeverity === "error") {
			return event === "deployment.failed";
		}

		if (minimumSeverity === "warning") {
			return event === "deployment.failed" || event === "deployment.cancelled";
		}

		return true;
	}
}

export const n8nTemplate = new N8nTemplateGenerator();
