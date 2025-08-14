import type { BaseWebhookContext } from "./types";
import { templateFactory } from "./template-factory";

export interface WebhookPayloadOptions {
  templateType: "generic" | "slack" | "n8n";
  customTemplate?: string;
  platformConfig?: any;
  context: BaseWebhookContext;
}

export function generateWebhookPayload(options: WebhookPayloadOptions): any {
  const { templateType, customTemplate, platformConfig, context } = options;

  switch (templateType) {
    case "slack":
      return templateFactory.generatePayload("slack", context, platformConfig);
    
    case "n8n":
      return templateFactory.generatePayload("n8n", context, platformConfig);
    
    case "generic":
    default:
      if (customTemplate) {
        return applyCustomTemplate(customTemplate, context);
      }
      return generateGenericPayload(context);
  }
}

function generateGenericPayload(context: BaseWebhookContext): any {
  const { event, timestamp, deployment, entity, project, source, trigger, error } = context;

  return {
    event,
    timestamp,
    deployment: {
      id: deployment.deploymentId,
      status: deployment.status,
      startedAt: deployment.startedAt,
      finishedAt: deployment.finishedAt,
      duration: deployment.duration,
    },
    application: entity.type === "application" ? {
      id: entity.id,
      name: entity.name,
      type: "application",
      url: entity.url,
      domains: entity.domains,
    } : undefined,
    compose: entity.type === "compose" ? {
      id: entity.id,
      name: entity.name,
      type: "compose",
      url: entity.url,
    } : undefined,
    project: {
      id: project.id,
      name: project.name,
    },
    source: source ? {
      type: source.type,
      branch: source.branch,
      commit: source.commit,
      repository: source.repository,
    } : undefined,
    trigger: {
      type: trigger.type,
      triggeredBy: trigger.triggeredBy,
    },
    error: error ? {
      message: error.message,
      stage: error.stage,
      logs: error.logs,
    } : undefined,
  };
}

function applyCustomTemplate(template: string, context: BaseWebhookContext): any {
  try {
    // Parse the template as JSON
    const parsedTemplate = JSON.parse(template);
    
    // Replace variables in the template
    return replaceVariables(parsedTemplate, context);
  } catch (error) {
    console.error("Failed to apply custom template:", error);
    // Fallback to generic payload if custom template fails
    return generateGenericPayload(context);
  }
}

function replaceVariables(obj: any, context: BaseWebhookContext): any {
  if (typeof obj === "string") {
    return replaceStringVariables(obj, context);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => replaceVariables(item, context));
  }
  
  if (obj !== null && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceVariables(value, context);
    }
    return result;
  }
  
  return obj;
}

function replaceStringVariables(str: string, context: BaseWebhookContext): string {
  const { event, timestamp, deployment, entity, project, source, trigger, error } = context;
  
  const variables: Record<string, any> = {
    event,
    timestamp,
    deploymentId: deployment.deploymentId,
    deploymentStatus: deployment.status,
    deploymentStartedAt: deployment.startedAt,
    deploymentFinishedAt: deployment.finishedAt || "",
    deploymentDuration: deployment.duration || 0,
    deploymentStage: deployment.stage || "",
    entityType: entity.type,
    entityId: entity.id,
    entityName: entity.name,
    entityUrl: entity.url || "",
    applicationId: entity.type === "application" ? entity.id : "",
    applicationName: entity.type === "application" ? entity.name : "",
    composeId: entity.type === "compose" ? entity.id : "",
    composeName: entity.type === "compose" ? entity.name : "",
    projectId: project.id,
    projectName: project.name,
    branch: source?.branch || "",
    commit: source?.commit || "",
    repository: source?.repository || "",
    commitMessage: source?.commitMessage || "",
    author: source?.author || "",
    triggerType: trigger.type,
    triggeredBy: trigger.triggeredBy,
    errorMessage: error?.message || "",
    errorStage: error?.stage || "",
    errorCode: error?.code || "",
    errorLogs: error?.logs || "",
    duration: deployment.duration ? `${deployment.duration}s` : "",
    url: entity.url || "",
  };
  
  // Replace ${variableName} patterns
  return str.replace(/\$\{(\w+)\}/g, (match, varName) => {
    if (varName in variables) {
      const value = variables[varName];
      return value !== null && value !== undefined ? String(value) : "";
    }
    return match;
  });
}

export function validateWebhookPayload(
  templateType: string,
  payload: any
): boolean {
  if (templateType === "generic") {
    return validateGenericPayload(payload);
  }
  
  return templateFactory.validatePayload(templateType, payload);
}

function validateGenericPayload(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (!payload.event || !payload.timestamp) return false;
  if (!payload.deployment || typeof payload.deployment !== "object") return false;
  if (!payload.project || typeof payload.project !== "object") return false;
  
  return true;
}

export function previewWebhookPayload(
  options: WebhookPayloadOptions
): string {
  const payload = generateWebhookPayload(options);
  return JSON.stringify(payload, null, 2);
}