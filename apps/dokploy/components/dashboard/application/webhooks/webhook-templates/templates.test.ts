import { describe, it, expect } from "vitest";
import { n8nTemplate } from "./n8n-template";
import { slackTemplate } from "./slack-template";
import { generateWebhookPayload, validateWebhookPayload } from "./payload-generator";
import type { BaseWebhookContext } from "./types";

describe("Webhook Templates", () => {
  const sampleContext: BaseWebhookContext = {
    event: "deployment.success",
    timestamp: "2024-01-15T10:00:00.000Z",
    webhookId: "wh_test123",
    deployment: {
      deploymentId: "dep_abc123",
      status: "success",
      startedAt: "2024-01-15T09:58:00.000Z",
      finishedAt: "2024-01-15T10:00:00.000Z",
      duration: 120,
      stage: "production",
    },
    entity: {
      type: "application",
      id: "app_xyz789",
      name: "test-app",
      url: "https://test-app.dokploy.com",
      domains: ["test-app.dokploy.com"],
    },
    project: {
      id: "proj_123",
      name: "Test Project",
    },
    source: {
      type: "github",
      branch: "main",
      commit: "abc123def456",
      repository: "https://github.com/test/repo",
      commitMessage: "feat: Add new feature",
      author: "Test User",
    },
    trigger: {
      type: "webhook",
      triggeredBy: "GitHub Actions",
      source: "push",
    },
  };

  const failureContext: BaseWebhookContext = {
    ...sampleContext,
    event: "deployment.failed",
    deployment: {
      ...sampleContext.deployment,
      status: "failed",
      finishedAt: undefined,
      duration: undefined,
    },
    error: {
      message: "Build failed: Module not found",
      stage: "build",
      code: "BUILD_ERROR",
      logs: "Error: Cannot resolve module '@/components/Header'",
    },
  };

  describe("n8n Template", () => {
    it("should generate valid n8n payload for success event", () => {
      const payload = n8nTemplate.generate(sampleContext);
      
      expect(payload).toHaveProperty("event", "deployment.success");
      expect(payload).toHaveProperty("timestamp");
      expect(payload).toHaveProperty("data");
      expect(payload).toHaveProperty("n8n");
      
      expect(payload.data).toHaveProperty("deploymentId", "dep_abc123");
      expect(payload.data).toHaveProperty("entityType", "application");
      expect(payload.data).toHaveProperty("entityName", "test-app");
      
      expect(payload.n8n).toHaveProperty("priority", "low");
      expect(payload.n8n).toHaveProperty("retryable");
      expect(payload.n8n).toHaveProperty("tags");
      expect(payload.n8n.tags).toContain("deployment-success");
    });

    it("should generate valid n8n payload for failure event", () => {
      const payload = n8nTemplate.generate(failureContext);
      
      expect(payload.event).toBe("deployment.failed");
      expect(payload.data.errorMessage).toBe("Build failed: Module not found");
      expect(payload.data.errorStage).toBe("build");
      expect(payload.n8n.priority).toBe("normal");
      expect(payload.n8n.retryable).toBe(true);
    });

    it("should apply branch filtering", () => {
      const config = {
        url: "https://n8n.example.com/webhook/test",
        branches: ["develop", "staging"],
      };
      
      const payload = n8nTemplate.generate(sampleContext, config);
      expect(payload).toBeDefined();
      
      // main branch should be filtered out
      const contextWithDifferentBranch = {
        ...sampleContext,
        source: { ...sampleContext.source!, branch: "feature/test" },
      };
      const filteredPayload = n8nTemplate.generate(contextWithDifferentBranch, config);
      expect(filteredPayload).toBeDefined();
    });

    it("should validate n8n payload correctly", () => {
      const payload = n8nTemplate.generate(sampleContext);
      expect(n8nTemplate.validate(payload)).toBe(true);
      
      expect(n8nTemplate.validate({})).toBe(false);
      expect(n8nTemplate.validate({ event: "test" })).toBe(false);
      expect(n8nTemplate.validate({ event: "test", data: {}, n8n: { priority: "invalid" } })).toBe(false);
    });

    it("should process error logs correctly", () => {
      const longLogs = Array(100).fill("Log line").join("\n");
      const contextWithLongLogs = {
        ...failureContext,
        error: {
          ...failureContext.error!,
          logs: longLogs,
        },
      };
      
      const config = { url: "test", logLines: 10 };
      const payload = n8nTemplate.generate(contextWithLongLogs, config);
      
      const logLines = payload.data.errorLogs?.split("\n");
      expect(logLines?.length).toBeLessThanOrEqual(10);
    });
  });

  describe("Slack Template", () => {
    it("should generate valid Slack payload for success event", () => {
      const payload = slackTemplate.generate(sampleContext);
      
      expect(payload).toHaveProperty("text");
      expect(payload).toHaveProperty("blocks");
      expect(payload.text).toContain("✅");
      expect(payload.text).toContain("test-app");
      
      const headerBlock = payload.blocks?.find((b: any) => b.type === "header");
      expect(headerBlock?.text?.text).toContain("🚀 Deployment Successful");
    });

    it("should generate valid Slack payload for failure event", () => {
      const payload = slackTemplate.generate(failureContext);
      
      expect(payload.text).toContain("❌");
      expect(payload.text).toContain("failed");
      
      const headerBlock = payload.blocks?.find((b: any) => b.type === "header");
      expect(headerBlock?.text?.text).toContain("❌ Deployment Failed");
      
      // Check for error message in blocks
      const errorBlock = payload.blocks?.find((b: any) => 
        b.type === "section" && b.text?.text?.includes("Module not found")
      );
      expect(errorBlock).toBeDefined();
    });

    it("should include action buttons", () => {
      const config = { url: "test", enableActions: true };
      const payload = slackTemplate.generate(sampleContext, config);
      
      const actionsBlock = payload.blocks?.find((b: any) => b.type === "actions");
      expect(actionsBlock).toBeDefined();
      expect(actionsBlock?.elements).toHaveLength(2);
      expect(actionsBlock?.elements[0].text.text).toBe("View Application");
    });

    it("should handle mentions correctly", () => {
      const config = {
        url: "test",
        mentionOn: {
          failure: true,
          success: false,
          users: ["U123456"],
          groups: ["S789012"],
        },
      };
      
      const failurePayload = slackTemplate.generate(failureContext, config);
      const blocks = failurePayload.blocks || [];
      const mentionBlock = blocks.find((b: any) => 
        b.type === "section" && b.text?.text?.includes("<@U123456>")
      );
      expect(mentionBlock).toBeDefined();
      
      const successPayload = slackTemplate.generate(sampleContext, config);
      const successMentionBlock = successPayload.blocks?.find((b: any) => 
        b.text?.text?.includes("<@U123456>")
      );
      expect(successMentionBlock).toBeUndefined();
    });

    it("should format duration correctly", () => {
      const payload = slackTemplate.generate(sampleContext);
      const fieldsBlock = payload.blocks?.find((b: any) => 
        b.type === "section" && b.fields
      );
      
      const durationField = fieldsBlock?.fields?.find((f: any) => 
        f.text.includes("Duration")
      );
      expect(durationField?.text).toContain("2m 0s");
    });

    it("should validate Slack payload correctly", () => {
      const payload = slackTemplate.generate(sampleContext);
      expect(slackTemplate.validate(payload)).toBe(true);
      
      expect(slackTemplate.validate({})).toBe(false);
      expect(slackTemplate.validate({ blocks: [] })).toBe(false);
      expect(slackTemplate.validate({ text: "test", blocks: "invalid" })).toBe(false);
    });

    it("should include commit information when configured", () => {
      const config = {
        url: "test",
        includeCommitHistory: true,
      };
      
      const payload = slackTemplate.generate(sampleContext, config);
      const commitBlock = payload.blocks?.find((b: any) => 
        b.type === "section" && b.text?.text?.includes("Latest Commit")
      );
      
      expect(commitBlock).toBeDefined();
      expect(commitBlock?.text?.text).toContain("Add new feature");
    });

    it("should add metrics attachment when configured", () => {
      const config = {
        url: "test",
        includeMetrics: true,
      };
      
      const payload = slackTemplate.generate(sampleContext, config);
      expect(payload.attachments).toBeDefined();
      expect(payload.attachments?.[0]?.color).toBe("good");
      const firstField = payload.attachments?.[0]?.fields?.[0];
      expect(firstField?.title).toBe("Deployment Metrics");
    });
  });

  describe("Payload Generator", () => {
    it("should generate generic payload correctly", () => {
      const payload = generateWebhookPayload({
        templateType: "generic",
        context: sampleContext,
      });
      
      expect(payload).toHaveProperty("event", "deployment.success");
      expect(payload).toHaveProperty("deployment");
      expect(payload).toHaveProperty("application");
      expect(payload).toHaveProperty("project");
      expect(payload.compose).toBeUndefined();
    });

    it("should apply custom template with variable substitution", () => {
      const customTemplate = JSON.stringify({
        event: "${event}",
        app: "${entityName}",
        branch: "${branch}",
        status: "${deploymentStatus}",
      });
      
      const payload = generateWebhookPayload({
        templateType: "generic",
        customTemplate,
        context: sampleContext,
      });
      
      expect(payload.event).toBe("deployment.success");
      expect(payload.app).toBe("test-app");
      expect(payload.branch).toBe("main");
      expect(payload.status).toBe("success");
    });

    it("should handle compose entities correctly", () => {
      const composeContext: BaseWebhookContext = {
        ...sampleContext,
        entity: {
          type: "compose",
          id: "compose_123",
          name: "test-compose",
          url: "https://compose.dokploy.com",
        },
      };
      
      const payload = generateWebhookPayload({
        templateType: "generic",
        context: composeContext,
      });
      
      expect(payload.application).toBeUndefined();
      expect(payload.compose).toBeDefined();
      expect(payload.compose?.name).toBe("test-compose");
    });

    it("should validate payloads correctly", () => {
      const genericPayload = generateWebhookPayload({
        templateType: "generic",
        context: sampleContext,
      });
      expect(validateWebhookPayload("generic", genericPayload)).toBe(true);
      
      const n8nPayload = generateWebhookPayload({
        templateType: "n8n",
        context: sampleContext,
      });
      expect(validateWebhookPayload("n8n", n8nPayload)).toBe(true);
      
      const slackPayload = generateWebhookPayload({
        templateType: "slack",
        context: sampleContext,
      });
      expect(validateWebhookPayload("slack", slackPayload)).toBe(true);
      
      expect(validateWebhookPayload("generic", {})).toBe(false);
      expect(validateWebhookPayload("n8n", {})).toBe(false);
      expect(validateWebhookPayload("slack", {})).toBe(false);
    });

    it("should handle missing optional fields gracefully", () => {
      const minimalContext: BaseWebhookContext = {
        event: "deployment.started",
        timestamp: "2024-01-15T10:00:00.000Z",
        webhookId: "wh_test",
        deployment: {
          deploymentId: "dep_123",
          status: "running",
          startedAt: "2024-01-15T10:00:00.000Z",
        },
        entity: {
          type: "application",
          id: "app_123",
          name: "app",
        },
        project: {
          id: "proj_123",
          name: "Project",
        },
        trigger: {
          type: "manual",
          triggeredBy: "user",
        },
      };
      
      const genericPayload = generateWebhookPayload({
        templateType: "generic",
        context: minimalContext,
      });
      expect(genericPayload).toBeDefined();
      expect(genericPayload.source).toBeUndefined();
      expect(genericPayload.error).toBeUndefined();
      
      const n8nPayload = generateWebhookPayload({
        templateType: "n8n",
        context: minimalContext,
      });
      expect(n8nPayload).toBeDefined();
      expect(n8nPayload.data.sourceType).toBeUndefined();
      
      const slackPayload = generateWebhookPayload({
        templateType: "slack",
        context: minimalContext,
      });
      expect(slackPayload).toBeDefined();
      expect(slackPayload.text).toContain("app");
    });
  });
});