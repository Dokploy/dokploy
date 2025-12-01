-- Migration: Kubernetes Support
-- Description: Add Kubernetes orchestrator support alongside Docker Swarm

-- Create orchestrator type enum
DO $$ BEGIN
    CREATE TYPE "orchestratorType" AS ENUM('swarm', 'kubernetes');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create K8s deployment strategy enum
DO $$ BEGIN
    CREATE TYPE "k8sDeploymentStrategy" AS ENUM('rolling', 'recreate', 'blue-green', 'canary');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create K8s resource kind enum
DO $$ BEGIN
    CREATE TYPE "k8sResourceKind" AS ENUM(
        'IngressRoute', 'Middleware', 'TLSOption', 'ServersTransport',
        'IngressRouteTCP', 'IngressRouteUDP', 'HPA', 'NetworkPolicy',
        'PodDisruptionBudget', 'ServiceMonitor', 'PrometheusRule', 'Other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create K8s metric type enum
DO $$ BEGIN
    CREATE TYPE "k8sMetricType" AS ENUM('resource', 'pods', 'external', 'custom');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create K8s policy direction enum
DO $$ BEGIN
    CREATE TYPE "k8sPolicyDirection" AS ENUM('ingress', 'egress');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create K8s event type enum
DO $$ BEGIN
    CREATE TYPE "k8sEventType" AS ENUM('Normal', 'Warning');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- Server Table Extensions
-- =============================================================================

-- Add orchestrator type to server table
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "orchestratorType" "orchestratorType" DEFAULT 'swarm' NOT NULL;

-- Add Kubernetes-specific fields to server table
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "k8sContext" text;
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "k8sNamespace" text DEFAULT 'dokploy';
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "k8sVersion" text;
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "k8sApiEndpoint" text;
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "k8sKubeconfig" text;
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "k8sCapabilities" jsonb DEFAULT '{"supportsHPA": false, "supportsNetworkPolicies": false, "metricsServerInstalled": false, "ingressController": null, "storageClasses": [], "supportsPodDisruptionBudget": false}'::jsonb;

-- =============================================================================
-- Application Table Extensions
-- =============================================================================

-- Add Kubernetes deployment configuration
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sDeploymentName" text;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sNamespace" text;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sDeploymentStrategy" "k8sDeploymentStrategy" DEFAULT 'rolling';

-- Add HPA configuration
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sHpaEnabled" boolean DEFAULT false;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sHpaMinReplicas" integer DEFAULT 1;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sHpaMaxReplicas" integer DEFAULT 10;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sHpaTargetCPU" integer DEFAULT 80;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sHpaTargetMemory" integer;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sHpaScaleDownStabilization" integer DEFAULT 300;

-- Add Network Policy configuration
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sNetworkPolicyEnabled" boolean DEFAULT false;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sAllowedNamespaces" text[];

-- Add Resource configuration
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sResourceConfig" jsonb DEFAULT '{"requests": {"cpu": "100m", "memory": "128Mi"}, "limits": {"cpu": "500m", "memory": "512Mi"}}'::jsonb;

-- Add Probes configuration
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sProbes" jsonb DEFAULT '{}'::jsonb;

-- Add Labels and Annotations
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sLabels" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sAnnotations" jsonb DEFAULT '{}'::jsonb;

-- Add Service Account
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sServiceAccount" text;

-- Add Pod Disruption Budget
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sPdbMinAvailable" integer;
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "k8sPdbMaxUnavailable" integer;

-- =============================================================================
-- New Tables for Kubernetes
-- =============================================================================

-- K8s Custom Resource Table
CREATE TABLE IF NOT EXISTS "k8s_custom_resource" (
    "resourceId" text PRIMARY KEY NOT NULL,
    "applicationId" text REFERENCES "application"("applicationId") ON DELETE CASCADE,
    "serverId" text REFERENCES "server"("serverId") ON DELETE CASCADE,
    "kind" "k8sResourceKind" NOT NULL,
    "apiVersion" text NOT NULL,
    "name" text NOT NULL,
    "namespace" text NOT NULL,
    "manifest" jsonb NOT NULL,
    "applied" boolean DEFAULT false,
    "lastAppliedAt" timestamp,
    "lastError" text,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- K8s Metrics Cache Table
CREATE TABLE IF NOT EXISTS "k8s_metrics" (
    "metricId" text PRIMARY KEY NOT NULL,
    "applicationId" text NOT NULL REFERENCES "application"("applicationId") ON DELETE CASCADE,
    "metricName" text NOT NULL,
    "metricType" "k8sMetricType" NOT NULL,
    "query" text,
    "targetValue" text,
    "targetType" text,
    "currentValue" text,
    "lastUpdated" timestamp,
    "enabled" boolean DEFAULT true,
    "createdAt" timestamp DEFAULT now() NOT NULL
);

-- K8s Network Policy Rule Table
CREATE TABLE IF NOT EXISTS "k8s_network_policy_rule" (
    "ruleId" text PRIMARY KEY NOT NULL,
    "applicationId" text NOT NULL REFERENCES "application"("applicationId") ON DELETE CASCADE,
    "direction" "k8sPolicyDirection" NOT NULL,
    "priority" integer DEFAULT 100,
    "peerConfig" jsonb NOT NULL,
    "ports" jsonb DEFAULT '[]'::jsonb,
    "description" text,
    "enabled" boolean DEFAULT true,
    "createdAt" timestamp DEFAULT now() NOT NULL
);

-- K8s Event Log Table
CREATE TABLE IF NOT EXISTS "k8s_event_log" (
    "eventId" text PRIMARY KEY NOT NULL,
    "applicationId" text REFERENCES "application"("applicationId") ON DELETE CASCADE,
    "serverId" text REFERENCES "server"("serverId") ON DELETE CASCADE,
    "eventType" "k8sEventType" NOT NULL,
    "reason" text NOT NULL,
    "message" text NOT NULL,
    "involvedObject" text,
    "source" text,
    "count" integer DEFAULT 1,
    "firstTimestamp" timestamp NOT NULL,
    "lastTimestamp" timestamp NOT NULL,
    "namespace" text,
    "createdAt" timestamp DEFAULT now() NOT NULL
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Server indexes
CREATE INDEX IF NOT EXISTS "server_orchestrator_type_idx" ON "server"("orchestratorType");

-- Application K8s indexes
CREATE INDEX IF NOT EXISTS "application_k8s_namespace_idx" ON "application"("k8sNamespace");
CREATE INDEX IF NOT EXISTS "application_k8s_hpa_enabled_idx" ON "application"("k8sHpaEnabled");

-- K8s Custom Resource indexes
CREATE INDEX IF NOT EXISTS "k8s_custom_resource_application_idx" ON "k8s_custom_resource"("applicationId");
CREATE INDEX IF NOT EXISTS "k8s_custom_resource_server_idx" ON "k8s_custom_resource"("serverId");
CREATE INDEX IF NOT EXISTS "k8s_custom_resource_kind_idx" ON "k8s_custom_resource"("kind");
CREATE INDEX IF NOT EXISTS "k8s_custom_resource_namespace_idx" ON "k8s_custom_resource"("namespace");

-- K8s Metrics indexes
CREATE INDEX IF NOT EXISTS "k8s_metrics_application_idx" ON "k8s_metrics"("applicationId");
CREATE INDEX IF NOT EXISTS "k8s_metrics_enabled_idx" ON "k8s_metrics"("enabled");

-- K8s Network Policy Rule indexes
CREATE INDEX IF NOT EXISTS "k8s_network_policy_rule_application_idx" ON "k8s_network_policy_rule"("applicationId");

-- K8s Event Log indexes
CREATE INDEX IF NOT EXISTS "k8s_event_log_application_idx" ON "k8s_event_log"("applicationId");
CREATE INDEX IF NOT EXISTS "k8s_event_log_server_idx" ON "k8s_event_log"("serverId");
CREATE INDEX IF NOT EXISTS "k8s_event_log_event_type_idx" ON "k8s_event_log"("eventType");
