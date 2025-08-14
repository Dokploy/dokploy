import type { Webhook } from "@dokploy/server/db/schema";

export type DeploymentEvent = 
  | "deployment.started"
  | "deployment.success"
  | "deployment.failed"
  | "deployment.cancelled";

export interface BaseWebhookContext {
  event: DeploymentEvent;
  timestamp: string;
  webhookId: string;
  deployment: {
    deploymentId: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    duration?: number;
    stage?: string;
  };
  entity: {
    type: "application" | "compose";
    id: string;
    name: string;
    url?: string;
    domains?: string[];
  };
  project: {
    id: string;
    name: string;
  };
  source?: {
    type: "github" | "gitlab" | "bitbucket" | "docker" | "git";
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

export interface N8nWebhookPayload {
  event: DeploymentEvent;
  timestamp: string;
  webhookId: string;
  data: {
    deploymentId: string;
    deploymentStatus: string;
    deploymentStartedAt: string;
    deploymentFinishedAt?: string;
    deploymentDuration?: number;
    deploymentStage?: string;
    entityType: "application" | "compose";
    entityId: string;
    entityName: string;
    entityUrl?: string;
    entityDomains?: string[];
    projectId: string;
    projectName: string;
    sourceType?: string;
    sourceBranch?: string;
    sourceCommit?: string;
    sourceRepository?: string;
    sourceCommitMessage?: string;
    sourceAuthor?: string;
    triggerType: string;
    triggeredBy: string;
    triggerSource?: string;
    errorMessage?: string;
    errorStage?: string;
    errorCode?: string;
    errorLogs?: string;
    metadata: {
      dokployVersion: string;
      environment?: string;
      region?: string;
      customFields?: Record<string, any>;
    };
  };
  n8n: {
    workflowRecommendation?: string;
    retryable: boolean;
    priority: "low" | "normal" | "high";
    tags?: string[];
  };
}

export interface SlackBlock {
  type: string;
  [key: string]: any;
}

export interface SlackWebhookPayload {
  text: string;
  blocks?: SlackBlock[];
  thread_ts?: string;
  attachments?: Array<{
    color?: string;
    blocks?: SlackBlock[];
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
    footer?: string;
    footer_icon?: string;
    ts?: number;
  }>;
}

export interface N8nWebhookConfig {
  url: string;
  secret?: string;
  workflowId?: string;
  testMode?: boolean;
  includeMetrics?: boolean;
  includeLogs?: boolean;
  logLines?: number;
  minimumSeverity?: "all" | "warning" | "error";
  branches?: string[];
  customFields?: Record<string, any>;
  transformScript?: string;
}

export interface SlackWebhookConfig {
  url: string;
  channel?: string;
  mentionOn?: {
    failure: boolean;
    success: boolean;
    users?: string[];
    groups?: string[];
  };
  threadingEnabled?: boolean;
  threadingStrategy?: "per-app" | "per-deployment" | "per-day";
  colorScheme?: "default" | "custom" | "monochrome";
  includeGraphs?: boolean;
  logoUrl?: string;
  includeChangelog?: boolean;
  includeMetrics?: boolean;
  includeCommitHistory?: boolean;
  maxCommits?: number;
  enableActions?: boolean;
  customActions?: Array<{
    text: string;
    url: string;
    style?: "primary" | "danger" | "default";
  }>;
}

export type WebhookConfig = Webhook;

export interface TemplateGenerator<T = any> {
  generate(context: BaseWebhookContext, config?: T): any;
  validate(payload: any): boolean;
  preview(context: BaseWebhookContext, config?: T): string;
}