import type {
  BaseWebhookContext,
  SlackWebhookPayload,
  SlackWebhookConfig,
  SlackBlock,
  TemplateGenerator,
} from "./types";

export class SlackTemplateGenerator implements TemplateGenerator<SlackWebhookConfig> {
  generate(
    context: BaseWebhookContext,
    config?: SlackWebhookConfig
  ): SlackWebhookPayload {
    const { event, deployment, entity, project, source, trigger, error } = context;

    switch (event) {
      case "deployment.success":
        return this.generateSuccessMessage(context, config);
      case "deployment.failed":
        return this.generateFailureMessage(context, config);
      case "deployment.started":
        return this.generateStartedMessage(context, config);
      case "deployment.cancelled":
        return this.generateCancelledMessage(context, config);
      default:
        return this.generateGenericMessage(context, config);
    }
  }

  validate(payload: any): boolean {
    if (!payload || typeof payload !== "object") return false;
    if (!payload.text || typeof payload.text !== "string") return false;
    
    if (payload.blocks && !Array.isArray(payload.blocks)) return false;
    if (payload.attachments && !Array.isArray(payload.attachments)) return false;
    
    return true;
  }

  preview(context: BaseWebhookContext, config?: SlackWebhookConfig): string {
    const payload = this.generate(context, config);
    return JSON.stringify(payload, null, 2);
  }

  private generateSuccessMessage(
    context: BaseWebhookContext,
    config?: SlackWebhookConfig
  ): SlackWebhookPayload {
    const { deployment, entity, source, trigger } = context;
    const duration = this.formatDuration(deployment.duration);
    const deploymentUrl = this.getDeploymentUrl(deployment.deploymentId);
    
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚀 Deployment Successful",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Application:*\n${entity.url ? `<${entity.url}|${entity.name}>` : entity.name}`,
          },
          {
            type: "mrkdwn",
            text: `*Environment:*\n${process.env.NODE_ENV || "Production"}`,
          },
          {
            type: "mrkdwn",
            text: `*Version:*\n${source?.commit ? `\`${source.commit.substring(0, 7)}\`` : "N/A"}`,
          },
          {
            type: "mrkdwn",
            text: `*Duration:*\n${duration}`,
          },
        ],
      },
    ];

    // Add source information if available
    if (source) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: this.formatSourceInfo(source, trigger),
        },
      });
    }

    // Add commit history if configured
    if (config?.includeCommitHistory && source?.commitMessage) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Latest Commit:*\n${source.commitMessage}`,
        },
      });
    }

    // Add action buttons
    if (config?.enableActions !== false) {
      const actions: any[] = [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Application",
          },
          url: entity.url || deploymentUrl,
          style: "primary",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Logs",
          },
          url: `${deploymentUrl}/logs`,
        },
      ];

      // Add custom actions
      if (config?.customActions) {
        config.customActions.forEach((action) => {
          actions.push({
            type: "button",
            text: {
              type: "plain_text",
              text: action.text,
            },
            url: action.url,
            style: action.style || "default",
          });
        });
      }

      blocks.push({
        type: "actions",
        elements: actions,
      });
    }

    // Add context footer
    blocks.push(this.generateFooter(context));

    const payload: SlackWebhookPayload = {
      text: `✅ Deployment successful for ${entity.name}`,
      blocks,
    };

    // Add metrics attachment if configured
    if (config?.includeMetrics) {
      payload.attachments = [
        {
          color: "good",
          fields: [
            {
              title: "Deployment Metrics",
              value: this.generateMetricsText(context),
              short: false,
            },
          ],
        },
      ];
    }

    return payload;
  }

  private generateFailureMessage(
    context: BaseWebhookContext,
    config?: SlackWebhookConfig
  ): SlackWebhookPayload {
    const { deployment, entity, error, trigger } = context;
    const deploymentUrl = this.getDeploymentUrl(deployment.deploymentId);
    const mention = this.getMentionText(config, "failure");
    
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "❌ Deployment Failed",
          emoji: true,
        },
      },
    ];

    // Add mention if configured
    if (mention) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: mention,
        },
      });
    }

    blocks.push({
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Application:*\n${entity.name}`,
        },
        {
          type: "mrkdwn",
          text: `*Stage:*\n${error?.stage || deployment.stage || "Unknown"}`,
        },
      ],
    });

    // Add error details
    if (error) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `\`\`\`\n${this.truncateError(error.message)}\n\`\`\``,
        },
      });

      // Add suggested solutions if available
      const solutions = this.getSuggestedSolutions(error);
      if (solutions.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Possible Solutions:*\n${solutions.map((s) => `• ${s}`).join("\n")}`,
          },
        });
      }
    }

    // Add action buttons
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Full Logs",
          },
          url: `${deploymentUrl}/logs`,
          style: "primary",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Retry Deployment",
          },
          url: `${deploymentUrl}/retry`,
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Rollback",
          },
          url: `${deploymentUrl}/rollback`,
          style: "danger",
        },
      ],
    });

    // Add context footer
    blocks.push(this.generateFooter(context));

    const payload: SlackWebhookPayload = {
      text: `❌ Deployment failed for ${entity.name}`,
      blocks,
    };

    // Add deployment history attachment
    payload.attachments = [
      {
        color: "danger",
        fields: [
          {
            title: "Recent Deployments",
            value: "View deployment history in the dashboard",
            short: false,
          },
        ],
      },
    ];

    return payload;
  }

  private generateStartedMessage(
    context: BaseWebhookContext,
    config?: SlackWebhookConfig
  ): SlackWebhookPayload {
    const { deployment, entity, source, trigger } = context;
    
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔄 Deployment Started",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Deployment initiated for *${entity.name}*`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Triggered by:*\n${trigger.triggeredBy}`,
          },
          {
            type: "mrkdwn",
            text: `*Branch:*\n${source?.branch || "N/A"}`,
          },
        ],
      },
    ];

    blocks.push(this.generateFooter(context));

    return {
      text: `🔄 Deployment started for ${entity.name}`,
      blocks,
    };
  }

  private generateCancelledMessage(
    context: BaseWebhookContext,
    config?: SlackWebhookConfig
  ): SlackWebhookPayload {
    const { entity, trigger } = context;
    
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ Deployment Cancelled",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Deployment was cancelled for *${entity.name}*`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Cancelled by:*\n${trigger.triggeredBy}`,
          },
        ],
      },
    ];

    blocks.push(this.generateFooter(context));

    return {
      text: `⚠️ Deployment cancelled for ${entity.name}`,
      blocks,
    };
  }

  private generateGenericMessage(
    context: BaseWebhookContext,
    config?: SlackWebhookConfig
  ): SlackWebhookPayload {
    const { event, entity } = context;
    
    return {
      text: `${event} for ${entity.name}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Event: *${event}*\nEntity: *${entity.name}*`,
          },
        },
        this.generateFooter(context),
      ],
    };
  }

  private generateFooter(context: BaseWebhookContext): SlackBlock {
    const { deployment, project } = context;
    const dashboardUrl = process.env.DOKPLOY_URL || "https://dokploy.com/dashboard";
    
    return {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Dokploy • ${project.name} • Deployment #${deployment.deploymentId.substring(0, 8)} • <${dashboardUrl}|Dashboard>`,
        },
      ],
    };
  }

  private formatDuration(seconds?: number): string {
    if (!seconds) return "N/A";
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  private formatSourceInfo(source: any, trigger: any): string {
    const parts: string[] = [];
    
    parts.push(`*Deployed by:* ${trigger.triggeredBy}`);
    
    if (source.branch) {
      parts.push(`*Branch:* \`${source.branch}\``);
    }
    
    if (source.commit) {
      const shortCommit = source.commit.substring(0, 7);
      if (source.repository) {
        // Try to construct a commit URL
        const commitUrl = this.getCommitUrl(source.repository, source.commit);
        if (commitUrl) {
          parts.push(`*Commit:* <${commitUrl}|${shortCommit}>`);
        } else {
          parts.push(`*Commit:* \`${shortCommit}\``);
        }
      } else {
        parts.push(`*Commit:* \`${shortCommit}\``);
      }
      
      if (source.commitMessage) {
        parts.push(`"${this.truncateMessage(source.commitMessage)}"`);
      }
    }
    
    return parts.join("\n");
  }

  private getCommitUrl(repository: string, commit: string): string | null {
    // GitHub
    if (repository.includes("github.com")) {
      const match = repository.match(/github\.com[:/](.+?)(?:\.git)?$/);
      if (match) {
        return `https://github.com/${match[1]}/commit/${commit}`;
      }
    }
    
    // GitLab
    if (repository.includes("gitlab.com")) {
      const match = repository.match(/gitlab\.com[:/](.+?)(?:\.git)?$/);
      if (match) {
        return `https://gitlab.com/${match[1]}/-/commit/${commit}`;
      }
    }
    
    return null;
  }

  private getDeploymentUrl(deploymentId: string): string {
    const baseUrl = process.env.DOKPLOY_URL || "https://dokploy.com";
    return `${baseUrl}/dashboard/deployment/${deploymentId}`;
  }

  private getMentionText(config?: SlackWebhookConfig, event?: "failure" | "success"): string | null {
    if (!config?.mentionOn) return null;
    
    if (event === "failure" && !config.mentionOn.failure) return null;
    if (event === "success" && !config.mentionOn.success) return null;
    
    const mentions: string[] = [];
    
    if (config.mentionOn.users) {
      mentions.push(...config.mentionOn.users.map((u) => `<@${u}>`));
    }
    
    if (config.mentionOn.groups) {
      mentions.push(...config.mentionOn.groups.map((g) => `<!subteam^${g}>`));
    }
    
    if (mentions.length === 0 && event === "failure") {
      mentions.push("<!channel>");
    }
    
    return mentions.length > 0 ? mentions.join(" ") : null;
  }

  private truncateError(message: string, maxLength: number = 500): string {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + "...";
  }

  private truncateMessage(message: string, maxLength: number = 100): string {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + "...";
  }

  private getSuggestedSolutions(error: any): string[] {
    const solutions: string[] = [];
    
    if (error.message.includes("Module not found") || error.message.includes("Cannot resolve")) {
      solutions.push("Check if the module/file path is correct");
      solutions.push("Ensure all dependencies are installed");
      solutions.push("Verify import statements");
    } else if (error.message.includes("Permission denied")) {
      solutions.push("Check file and directory permissions");
      solutions.push("Verify user has necessary access rights");
    } else if (error.message.includes("port") || error.message.includes("EADDRINUSE")) {
      solutions.push("Check if the port is already in use");
      solutions.push("Try using a different port");
    } else if (error.message.includes("memory") || error.message.includes("heap")) {
      solutions.push("Increase memory allocation");
      solutions.push("Optimize build process");
    } else if (error.message.includes("timeout")) {
      solutions.push("Increase timeout limits");
      solutions.push("Check network connectivity");
    }
    
    return solutions;
  }

  private generateMetricsText(context: BaseWebhookContext): string {
    const metrics: string[] = [];
    
    if (context.deployment.duration) {
      metrics.push(`Build Time: ${this.formatDuration(context.deployment.duration)}`);
    }
    
    metrics.push(`Trigger: ${context.trigger.type}`);
    
    if (context.source?.commit) {
      metrics.push(`Commit: ${context.source.commit.substring(0, 7)}`);
    }
    
    return metrics.join(" | ");
  }
}

export const slackTemplate = new SlackTemplateGenerator();