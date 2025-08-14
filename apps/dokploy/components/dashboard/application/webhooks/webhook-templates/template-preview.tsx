import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BaseWebhookContext } from "./types";
import { generateWebhookPayload, previewWebhookPayload } from "./payload-generator";
import { cn } from "@/lib/utils";

interface TemplatePreviewProps {
  templateType: "generic" | "slack" | "n8n";
  customTemplate?: string;
  platformConfig?: any;
  context?: BaseWebhookContext;
  className?: string;
}

export function TemplatePreview({
  templateType,
  customTemplate,
  platformConfig,
  context,
  className,
}: TemplatePreviewProps) {
  const sampleContext: BaseWebhookContext = context || {
    event: "deployment.success",
    timestamp: new Date().toISOString(),
    webhookId: "wh_sample123",
    deployment: {
      deploymentId: "dep_abc123",
      status: "success",
      startedAt: new Date(Date.now() - 120000).toISOString(),
      finishedAt: new Date().toISOString(),
      duration: 120,
      stage: "production",
    },
    entity: {
      type: "application",
      id: "app_xyz789",
      name: "my-awesome-app",
      url: "https://my-app.dokploy.com",
      domains: ["my-app.dokploy.com", "www.my-app.dokploy.com"],
    },
    project: {
      id: "proj_123",
      name: "Production Project",
    },
    source: {
      type: "github",
      branch: "main",
      commit: "abc123def456",
      repository: "https://github.com/myorg/myrepo",
      commitMessage: "feat: Add new dashboard feature",
      author: "John Doe",
    },
    trigger: {
      type: "webhook",
      triggeredBy: "GitHub Actions",
      source: "push",
    },
  };

  const payloadPreview = useMemo(() => {
    try {
      return previewWebhookPayload({
        templateType,
        customTemplate,
        platformConfig,
        context: sampleContext,
      });
    } catch (error) {
      return `Error generating preview: ${error}`;
    }
  }, [templateType, customTemplate, platformConfig, sampleContext]);

  const slackPreview = useMemo(() => {
    if (templateType !== "slack") return null;
    
    try {
      const payload = generateWebhookPayload({
        templateType: "slack",
        platformConfig,
        context: sampleContext,
      });
      
      return <SlackMessagePreview payload={payload} />;
    } catch (error) {
      return <div className="text-red-500">Error rendering Slack preview</div>;
    }
  }, [templateType, platformConfig, sampleContext]);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Webhook Preview</span>
          <Badge variant="outline">{templateType.toUpperCase()}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="payload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payload">JSON Payload</TabsTrigger>
            {templateType === "slack" && (
              <TabsTrigger value="visual">Visual Preview</TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="payload" className="mt-4">
            <ScrollArea className="h-[400px] w-full rounded-md border">
              <pre className="p-4 text-sm">
                <code>{payloadPreview}</code>
              </pre>
            </ScrollArea>
          </TabsContent>
          
          {templateType === "slack" && (
            <TabsContent value="visual" className="mt-4">
              <ScrollArea className="h-[400px] w-full rounded-md border bg-slate-50 dark:bg-slate-900">
                <div className="p-4">
                  {slackPreview}
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface SlackMessagePreviewProps {
  payload: any;
}

function SlackMessagePreview({ payload }: SlackMessagePreviewProps) {
  if (!payload.blocks) {
    return <div className="text-gray-500">No blocks to preview</div>;
  }

  return (
    <div className="space-y-3">
      {payload.blocks.map((block: any, index: number) => (
        <SlackBlockPreview key={index} block={block} />
      ))}
      
      {payload.attachments?.map((attachment: any, index: number) => (
        <div
          key={`attachment-${index}`}
          className="rounded-md border-l-4 bg-white p-3 dark:bg-slate-800"
          style={{
            borderLeftColor: getAttachmentColor(attachment.color),
          }}
        >
          {attachment.fields?.map((field: any, fieldIndex: number) => (
            <div key={fieldIndex} className="mb-2">
              <div className="font-semibold text-sm">{field.title}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {field.value}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SlackBlockPreview({ block }: { block: any }) {
  switch (block.type) {
    case "header":
      return (
        <div className="text-xl font-bold">
          {block.text?.text || "Header"}
        </div>
      );
    
    case "section":
      if (block.fields) {
        return (
          <div className="grid grid-cols-2 gap-4">
            {block.fields.map((field: any, index: number) => (
              <div key={index}>
                <SlackMarkdown text={field.text} />
              </div>
            ))}
          </div>
        );
      }
      return (
        <div>
          <SlackMarkdown text={block.text?.text} />
        </div>
      );
    
    case "divider":
      return <hr className="my-2" />;
    
    case "context":
      return (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {block.elements?.map((element: any, index: number) => (
            <span key={index}>
              <SlackMarkdown text={element.text} />
            </span>
          ))}
        </div>
      );
    
    case "actions":
      return (
        <div className="flex gap-2">
          {block.elements?.map((element: any, index: number) => (
            <button
              key={index}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium",
                element.style === "primary"
                  ? "bg-green-600 text-white"
                  : element.style === "danger"
                  ? "bg-red-600 text-white"
                  : "border border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
              )}
            >
              {element.text?.text || "Button"}
            </button>
          ))}
        </div>
      );
    
    default:
      return null;
  }
}

function SlackMarkdown({ text }: { text?: string }) {
  if (!text) return null;
  
  // Simple markdown parsing for Slack mrkdwn format
  let formatted = text
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded">$1</code>')
    .replace(/<([^|>]+)\|([^>]+)>/g, '<a href="$1" class="text-blue-600 hover:underline">$2</a>')
    .replace(/<([^>]+)>/g, '<a href="$1" class="text-blue-600 hover:underline">$1</a>')
    .replace(/\n/g, '<br />');
  
  return <div dangerouslySetInnerHTML={{ __html: formatted }} />;
}

function getAttachmentColor(color?: string): string {
  switch (color) {
    case "good":
      return "#2eb886";
    case "warning":
      return "#ffc107";
    case "danger":
      return "#dc3545";
    default:
      return color || "#cccccc";
  }
}