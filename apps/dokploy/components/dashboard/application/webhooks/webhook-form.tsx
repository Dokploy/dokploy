import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const webhookFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	url: z.string().url("Must be a valid HTTPS URL").startsWith("https://"),
	secret: z.string().optional(),
	templateType: z.enum(["slack", "n8n", "generic"]).default("generic"),
	customTemplate: z.string().optional(),
	events: z
		.array(
			z.enum([
				"deployment.started",
				"deployment.success",
				"deployment.failed",
				"deployment.cancelled",
			]),
		)
		.min(1, "At least one event must be selected"),
	headers: z.record(z.string()).optional(),
	enabled: z.boolean().default(true),
});

export type WebhookFormValues = z.infer<typeof webhookFormSchema>;

const WEBHOOK_EVENTS = [
	{
		value: "deployment.started",
		label: "Deployment Started",
		description: "Triggered when a deployment begins",
		color: "default",
	},
	{
		value: "deployment.success",
		label: "Deployment Success",
		description: "Triggered when a deployment completes successfully",
		color: "success",
	},
	{
		value: "deployment.failed",
		label: "Deployment Failed",
		description: "Triggered when a deployment fails",
		color: "destructive",
	},
	{
		value: "deployment.cancelled",
		label: "Deployment Cancelled",
		description: "Triggered when a deployment is cancelled",
		color: "secondary",
	},
] as const;

const TEMPLATE_TYPES = [
	{
		value: "generic",
		label: "Generic JSON",
		description: "Standard JSON webhook payload",
	},
	{
		value: "slack",
		label: "Slack",
		description: "Formatted for Slack incoming webhooks",
	},
	{
		value: "n8n",
		label: "n8n",
		description: "Optimized for n8n workflow automation",
	},
] as const;

interface WebhookFormProps {
	initialData?: WebhookFormValues;
	onSubmit: (values: WebhookFormValues) => Promise<void>;
	isSubmitting?: boolean;
	formId?: string;
}

export const WebhookForm = ({
	initialData,
	onSubmit,
	formId = "webhook-form",
}: WebhookFormProps) => {
	const [customHeaders, setCustomHeaders] = useState<
		Array<{ key: string; value: string }>
	>([{ key: "", value: "" }]);

	const form = useForm<WebhookFormValues>({
		resolver: zodResolver(webhookFormSchema),
		defaultValues: initialData || {
			name: "",
			url: "",
			secret: undefined, // Don't send secret unless user provides it
			templateType: "generic",
			customTemplate: "",
			events: [],
			headers: {},
			enabled: true,
		},
	});

	useEffect(() => {
		if (initialData?.headers && Object.keys(initialData.headers).length > 0) {
			setCustomHeaders(
				Object.entries(initialData.headers).map(([key, value]) => ({
					key,
					value,
				})),
			);
		}
	}, [initialData]);

	const generateSecret = () => {
		const secret = Array.from({ length: 32 }, () =>
			Math.random().toString(36).charAt(2),
		).join("");
		form.setValue("secret", secret);
	};

	const copySecret = () => {
		const secret = form.getValues("secret");
		if (secret) {
			navigator.clipboard.writeText(secret);
			toast.success("Secret copied to clipboard");
		}
	};

	const handleAddHeader = () => {
		setCustomHeaders([...customHeaders, { key: "", value: "" }]);
	};

	const handleRemoveHeader = (index: number) => {
		setCustomHeaders(customHeaders.filter((_, i) => i !== index));
	};

	const handleHeaderChange = (
		index: number,
		field: "key" | "value",
		value: string,
	) => {
		const updated = [...customHeaders];
		if (updated[index]) {
			updated[index][field] = value;
		}
		setCustomHeaders(updated);
	};

	const handleFormSubmit = async (values: WebhookFormValues) => {
		const headers = customHeaders.reduce(
			(acc, { key, value }) => {
				if (key && value) {
					acc[key] = value;
				}
				return acc;
			},
			{} as Record<string, string>,
		);

		// Clean up the secret field - only send if user provided a value
		const cleanedValues = {
			...values,
			headers,
			secret: values.secret?.trim() || undefined,
		};

		await onSubmit(cleanedValues);
	};

	return (
		<Form {...form}>
			<form
				id={formId}
				onSubmit={form.handleSubmit(handleFormSubmit)}
				className="space-y-4"
			>
				<div className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input placeholder="My Webhook" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="templateType"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Template</FormLabel>
								<Select
									onValueChange={field.onChange}
									defaultValue={field.value}
									value={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select template" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{TEMPLATE_TYPES.map((template) => (
											<SelectItem key={template.value} value={template.value}>
												<div>
													<div>{template.label}</div>
													<div className="text-xs text-muted-foreground">
														{template.description}
													</div>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<FormField
					control={form.control}
					name="url"
					render={({ field }) => (
						<FormItem>
							<FormLabel>URL</FormLabel>
							<FormControl>
								<Input
									placeholder="https://hooks.slack.com/services/..."
									type="url"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								The HTTPS URL where webhook payloads will be sent
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="secret"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Secret</FormLabel>
							<FormControl>
								<div className="flex gap-2">
									<Input placeholder="Webhook secret (optional)" {...field} />
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={generateSecret}
									>
										<RefreshCw className="size-4" />
									</Button>
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={copySecret}
										disabled={!field.value}
									>
										<Copy className="size-4" />
									</Button>
								</div>
							</FormControl>
							<FormDescription>
								Used for signature validation (HMAC-SHA256)
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="events"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Trigger Events</FormLabel>
							<FormControl>
								<div className="space-y-2">
									{WEBHOOK_EVENTS.map((event) => (
										<div
											key={event.value}
											className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
										>
											<Checkbox
												checked={field.value?.includes(event.value)}
												onCheckedChange={(checked) => {
													const current = field.value || [];
													if (checked) {
														field.onChange([...current, event.value]);
													} else {
														field.onChange(
															current.filter((v: string) => v !== event.value),
														);
													}
												}}
											/>
											<div className="flex-1 space-y-1">
												<div className="flex items-center gap-2">
													<Label className="font-medium cursor-pointer">
														{event.label}
													</Label>
													<Badge
														variant={event.color as any}
														className="text-xs"
													>
														{event.value}
													</Badge>
												</div>
												<p className="text-xs text-muted-foreground">
													{event.description}
												</p>
											</div>
										</div>
									))}
								</div>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<Accordion type="single" collapsible className="w-full">
					<AccordionItem value="advanced">
						<AccordionTrigger>Advanced Settings</AccordionTrigger>
						<AccordionContent className="space-y-4 pt-4">
							<div>
								<Label>Custom Headers</Label>
								<div className="space-y-2 mt-2">
									{customHeaders.map((header, index) => (
										<div key={index} className="flex gap-2">
											<Input
												placeholder="Header name"
												value={header.key}
												onChange={(e) =>
													handleHeaderChange(index, "key", e.target.value)
												}
											/>
											<Input
												placeholder="Header value"
												value={header.value}
												onChange={(e) =>
													handleHeaderChange(index, "value", e.target.value)
												}
											/>
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => handleRemoveHeader(index)}
											>
												<Trash2 className="size-4" />
											</Button>
										</div>
									))}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleAddHeader}
									>
										<Plus className="size-4 mr-2" />
										Add Header
									</Button>
								</div>
							</div>

							{form.watch("templateType") === "generic" && (
								<FormField
									control={form.control}
									name="customTemplate"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Custom Template</FormLabel>
											<FormControl>
												<Textarea
													placeholder='{"text": "Deployment ${status} for ${applicationName}"}'
													className="font-mono text-xs min-h-[100px]"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Use variables like ${"{applicationName}"}, ${"{status}"}
												, ${"{branch}"}
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<FormItem className="flex items-center justify-between space-y-0 rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Enable Webhook</FormLabel>
											<FormDescription>
												Webhook will only trigger when enabled
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</form>
		</Form>
	);
};
