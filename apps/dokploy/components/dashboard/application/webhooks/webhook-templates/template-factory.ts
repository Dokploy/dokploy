import type { BaseWebhookContext, TemplateGenerator } from "./types";
import { n8nTemplate } from "./n8n-template";
import { slackTemplate } from "./slack-template";

export class TemplateFactory {
  private templates: Map<string, TemplateGenerator> = new Map();

  constructor() {
    this.registerTemplate("n8n", n8nTemplate);
    this.registerTemplate("slack", slackTemplate);
  }

  registerTemplate(name: string, generator: TemplateGenerator): void {
    this.templates.set(name, generator);
  }

  getTemplate(name: string): TemplateGenerator | undefined {
    return this.templates.get(name);
  }

  generatePayload(
    templateName: string,
    context: BaseWebhookContext,
    config?: any
  ): any {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template "${templateName}" not found`);
    }
    return template.generate(context, config);
  }

  validatePayload(templateName: string, payload: any): boolean {
    const template = this.getTemplate(templateName);
    if (!template) {
      return false;
    }
    return template.validate(payload);
  }

  previewPayload(
    templateName: string,
    context: BaseWebhookContext,
    config?: any
  ): string {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template "${templateName}" not found`);
    }
    return template.preview(context, config);
  }

  listTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }
}

export const templateFactory = new TemplateFactory();