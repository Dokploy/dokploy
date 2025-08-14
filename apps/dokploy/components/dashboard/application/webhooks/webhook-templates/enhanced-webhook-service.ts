import type { Webhook } from "@dokploy/server/db/schema";
import type { BaseWebhookContext } from "./types";
import { generateWebhookPayload } from "./payload-generator";
import { n8nConfigSchema, slackConfigSchema } from "./schemas";

/**
 * Enhanced webhook service that integrates the new template system
 * This service wraps the existing webhook functionality and adds support for
 * the new n8n and Slack templates with advanced configuration options
 */

export interface WebhookEventData {
  event: "deployment.started" | "deployment.success" | "deployment.failed" | "deployment.cancelled";
  timestamp: string;
  deployment: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    duration?: number;
  };
  application?: {
    id: string;
    name: string;
    type: string;
    url?: string;
    domains?: string[];
  };
  compose?: {
    id: string;
    name: string;
    type: string;
    url?: string;
  };
  project: {
    id: string;
    name: string;
  };
  source?: {
    type: string;
    branch?: string;
    commit?: string;
    repository?: string;
    commitMessage?: string;
    author?: string;
  };
  trigger: {
    type: "webhook" | "manual" | "schedule" | "api";
    triggeredBy: string;
    source?: string;
  };
  error?: {
    message: string;
    stage?: string;
    code?: string;
    logs?: string;
  };
}

/**
 * Converts the legacy webhook event format to the new BaseWebhookContext format
 */
export function convertToBaseContext(
  event: WebhookEventData,
  webhookId: string
): BaseWebhookContext {
  const entity = event.application 
    ? {
        type: "application" as const,
        id: event.application.id,
        name: event.application.name,
        url: event.application.url,
        domains: event.application.domains,
      }
    : {
        type: "compose" as const,
        id: event.compose!.id,
        name: event.compose!.name,
        url: event.compose?.url,
        domains: undefined,
      };

  return {
    event: event.event,
    timestamp: event.timestamp,
    webhookId,
    deployment: {
      deploymentId: event.deployment.id,
      status: event.deployment.status,
      startedAt: event.deployment.startedAt,
      finishedAt: event.deployment.finishedAt,
      duration: event.deployment.duration ? Math.round(event.deployment.duration / 1000) : undefined,
      stage: event.error?.stage,
    },
    entity,
    project: {
      id: event.project.id,
      name: event.project.name,
    },
    source: event.source ? {
      type: event.source.type as any,
      branch: event.source.branch,
      commit: event.source.commit,
      repository: event.source.repository,
      commitMessage: event.source.commitMessage,
      author: event.source.author,
    } : undefined,
    trigger: {
      type: event.trigger.type,
      triggeredBy: event.trigger.triggeredBy,
      source: event.trigger.source,
    },
    error: event.error,
  };
}

/**
 * Format webhook payload using the new template system
 */
export function formatWebhookPayload(
  webhook: Webhook,
  event: WebhookEventData,
  platformConfig?: any
): any {
  const context = convertToBaseContext(event, webhook.webhookId);
  
  // Parse platform config if it's passed as a string
  let parsedConfig: any = platformConfig;
  if (platformConfig && typeof platformConfig === "string") {
    try {
      parsedConfig = JSON.parse(platformConfig);
    } catch (e) {
      console.error("Failed to parse platform config:", e);
    }
  }

  // Generate payload based on template type
  return generateWebhookPayload({
    templateType: webhook.templateType as "generic" | "slack" | "n8n",
    customTemplate: webhook.customTemplate || undefined,
    platformConfig: parsedConfig,
    context,
  });
}

/**
 * Validate webhook configuration based on template type
 */
export function validateWebhookConfig(
  templateType: string,
  platformConfig?: any
): { valid: boolean; errors?: string[] } {
  if (templateType === "generic") {
    return { valid: true };
  }

  try {
    if (templateType === "n8n") {
      n8nConfigSchema.parse(platformConfig);
      return { valid: true };
    }

    if (templateType === "slack") {
      slackConfigSchema.parse(platformConfig);
      return { valid: true };
    }

    return { valid: false, errors: ["Unknown template type"] };
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join(".")}: ${e.message}`) || [error.message];
    return { valid: false, errors };
  }
}

/**
 * Get default configuration for a template type
 */
export function getDefaultConfig(templateType: string): any {
  switch (templateType) {
    case "n8n":
      return {
        testMode: false,
        includeMetrics: true,
        includeLogs: true,
        logLines: 50,
        minimumSeverity: "all",
      };
    
    case "slack":
      return {
        mentionOn: {
          failure: true,
          success: false,
        },
        threadingEnabled: false,
        threadingStrategy: "per-app",
        colorScheme: "default",
        includeMetrics: true,
        includeCommitHistory: true,
        maxCommits: 5,
        enableActions: true,
      };
    
    default:
      return {};
  }
}

/**
 * Check if webhook should be triggered based on configuration
 */
export function shouldTriggerWebhook(
  webhook: Webhook,
  event: WebhookEventData,
  platformConfig?: any
): boolean {
  // Check if webhook is enabled
  if (!webhook.enabled) {
    return false;
  }

  // Check if event type is in the subscribed events
  const events = webhook.events as string[];
  if (!events || !events.includes(event.event)) {
    return false;
  }

  // Platform-specific filtering
  if (webhook.templateType === "n8n" && platformConfig) {
    const config = typeof platformConfig === "string" 
      ? JSON.parse(platformConfig)
      : platformConfig;

    // Check branch filtering
    if (config.branches && config.branches.length > 0) {
      if (!event.source?.branch || !config.branches.includes(event.source.branch)) {
        return false;
      }
    }

    // Check severity filtering
    if (config.minimumSeverity && config.minimumSeverity !== "all") {
      if (config.minimumSeverity === "error" && event.event !== "deployment.failed") {
        return false;
      }
      if (config.minimumSeverity === "warning" && 
          !["deployment.failed", "deployment.cancelled"].includes(event.event)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get webhook headers including platform-specific headers
 */
export function getWebhookHeaders(
  webhook: Webhook,
  payload: any,
  signature?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Dokploy-Webhook/2.0",
    "X-Dokploy-Event": webhook.templateType || "generic",
  };

  // Add signature if secret is configured
  if (signature) {
    headers["X-Dokploy-Signature"] = signature;
  }

  // Add custom headers
  if (webhook.headers) {
    const customHeaders = typeof webhook.headers === "string"
      ? JSON.parse(webhook.headers)
      : webhook.headers;
    
    Object.assign(headers, customHeaders);
  }

  // Add platform-specific headers
  if (webhook.templateType === "n8n") {
    headers["X-N8n-Webhook"] = "true";
  }

  return headers;
}

/**
 * Get retry configuration based on template type
 */
export function getRetryConfig(templateType: string): {
  maxRetries: number;
  delays: number[];
} {
  switch (templateType) {
    case "n8n":
      // n8n typically handles retries internally, so fewer retries
      return {
        maxRetries: 2,
        delays: [30000, 120000], // 30s, 2m
      };
    
    case "slack":
      // Slack recommends exponential backoff
      return {
        maxRetries: 3,
        delays: [30000, 120000, 300000], // 30s, 2m, 5m
      };
    
    default:
      return {
        maxRetries: 3,
        delays: [30000, 120000, 300000], // 30s, 2m, 5m
      };
  }
}