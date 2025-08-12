import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Webhook, Copy, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CodeEditor } from "@/components/shared/code-editor";

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
			])
		)
		.min(1, "At least one event must be selected"),
	headers: z.record(z.string()).optional(),
	enabled: z.boolean().default(true),
});

type WebhookFormValues = z.infer<typeof webhookFormSchema>;

interface Props {
	applicationId?: string;
	composeId?: string;
	webhookId?: string | null;
	onClose: () => void;
	trigger?: React.ReactNode;
}

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

export const HandleWebhook = ({
	applicationId,
	composeId,
	webhookId,
	onClose,
	trigger,
}: Props) => {
	const [open, setOpen] = useState(false);
	const [customHeaders, setCustomHeaders] = useState<
		Array<{ key: string; value: string }>
	>([{ key: "", value: "" }]);

	const utils = api.useUtils();

	const { data: existingWebhook } = api.webhook.findById.useQuery(
		{ webhookId: webhookId! },
		{ enabled: !!webhookId }
	);

	const { mutateAsync: createWebhook, isLoading: isCreating } =
		api.webhook.create.useMutation();

	const { mutateAsync: updateWebhook, isLoading: isUpdating } =
		api.webhook.update.useMutation();

	const form = useForm<WebhookFormValues>({
		resolver: zodResolver(webhookFormSchema),
		defaultValues: {
			name: "",
			url: "",
			secret: "",
			templateType: "generic",
			customTemplate: "",
			events: [],
			headers: {},
			enabled: true,
		},
	});

	useEffect(() => {
		if (existingWebhook) {
			form.reset({
				name: existingWebhook.name,
				url: existingWebhook.url,
				secret: existingWebhook.secret || "",
				templateType: existingWebhook.templateType as any,
				customTemplate: existingWebhook.customTemplate || "",
				events: existingWebhook.events as any,
				headers: existingWebhook.headers as any,
				enabled: existingWebhook.enabled,
			});

			// Set custom headers
			const headers = existingWebhook.headers as Record<string, string>;
			if (headers && Object.keys(headers).length > 0) {
				setCustomHeaders(
					Object.entries(headers).map(([key, value]) => ({ key, value }))
				);
			}
		}
	}, [existingWebhook, form]);

	const generateSecret = () => {
		const secret = Array.from({ length: 32 }, () =>
			Math.random().toString(36).charAt(2)
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
		value: string
	) => {
		const updated = [...customHeaders];
		updated[index][field] = value;
		setCustomHeaders(updated);
	};

	const onSubmit = async (values: WebhookFormValues) => {
		try {
			// Convert custom headers array to object
			const headers = customHeaders.reduce((acc, { key, value }) => {
				if (key && value) {
					acc[key] = value;
				}
				return acc;
			}, {} as Record<string, string>);

			const data = {
				...values,
				headers,
				applicationId,
				composeId,
			};

			if (webhookId) {
				await updateWebhook({
					webhookId,
					...data,
				});
				toast.success("Webhook updated successfully");
			} else {
				await createWebhook(data);
				toast.success("Webhook created successfully");
			}

			form.reset();
			setOpen(false);
			onClose();
		} catch (error) {
			toast.error(
				webhookId ? "Failed to update webhook" : "Failed to create webhook"
			);
		}
	};

	return (
		<Dialog
			open={open || !!webhookId}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) {
					form.reset();
					onClose();
				}
			}}
		>
			<DialogTrigger asChild>
				{trigger || (
					<Button size="sm">
						<Plus className="size-4 mr-2" />
						Create Webhook
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Webhook className="size-5" />
						{webhookId ? "Edit Webhook" : "Create Webhook"}
					</DialogTitle>
					<DialogDescription>
						{webhookId ? "Update your webhook configuration" : "Configure a new webhook for deployment notifications"}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input
												placeholder="My Webhook"
												{...field}
											/>
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
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select template" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{TEMPLATE_TYPES.map((template) => (
													<SelectItem
														key={template.value}
														value={template.value}
													>
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
									<FormDescription>The HTTPS URL where webhook payloads will be sent</FormDescription>
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
											<Input
												placeholder="Webhook secret (optional)"
												{...field}
											/>
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
									<FormDescription>Used for signature validation (HMAC-SHA256)</FormDescription>
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
																	current.filter((v) => v !== event.value)
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
															handleHeaderChange(
																index,
																"key",
																e.target.value
															)
														}
													/>
													<Input
														placeholder="Header value"
														value={header.value}
														onChange={(e) =>
															handleHeaderChange(
																index,
																"value",
																e.target.value
															)
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
														Use variables like ${`{applicationName}`}, ${`{status}`}, ${`{branch}`}
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

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setOpen(false);
									form.reset();
									onClose();
								}}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isCreating || isUpdating}>
								{isCreating || isUpdating ? (
									<>
										<Loader2 className="size-4 mr-2 animate-spin" />
										{webhookId ? "Updating..." : "Creating..."}
									</>
								) : (
									<>{webhookId ? "Update" : "Create"} Webhook</>
								)}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

import { Loader2, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";