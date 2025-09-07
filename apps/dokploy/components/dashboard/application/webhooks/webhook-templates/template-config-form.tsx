import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	n8nConfigSchema,
	slackConfigSchema,
	type N8nConfig,
	type SlackConfig,
} from "./schemas";
import { Info, Plus, Trash2 } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface N8nConfigFormProps {
	config?: N8nConfig;
	onSubmit: (config: N8nConfig) => void;
}

export function N8nConfigForm({ config, onSubmit }: N8nConfigFormProps) {
	const form = useForm<N8nConfig>({
		resolver: zodResolver(n8nConfigSchema),
		defaultValues: config || {
			url: "",
			testMode: false,
			includeMetrics: true,
			includeLogs: true,
			logLines: 50,
			minimumSeverity: "all",
			branches: [],
		},
	});

	const watchBranches = form.watch("branches") || [];

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
				<FormField
					control={form.control}
					name="url"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Webhook URL *</FormLabel>
							<FormControl>
								<Input
									placeholder="https://your-n8n-instance.com/webhook/xxx"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								The n8n webhook URL from your workflow
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
							<FormLabel>Secret (Optional)</FormLabel>
							<FormControl>
								<Input
									type="password"
									placeholder="Optional HMAC secret"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								Used for signature validation (must match n8n webhook settings)
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<Accordion type="single" collapsible className="w-full">
					<AccordionItem value="advanced">
						<AccordionTrigger>Advanced Settings</AccordionTrigger>
						<AccordionContent className="space-y-4">
							<FormField
								control={form.control}
								name="workflowId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Workflow ID</FormLabel>
										<FormControl>
											<Input
												placeholder="Optional workflow identifier"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Used for correlating webhooks with specific workflows
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="testMode"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Test Mode</FormLabel>
											<FormDescription>
												Use n8n test URL instead of production URL
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

							<FormField
								control={form.control}
								name="includeMetrics"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Include Metrics</FormLabel>
											<FormDescription>
												Include performance metrics in payload
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

							<FormField
								control={form.control}
								name="includeLogs"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Include Logs</FormLabel>
											<FormDescription>
												Include deployment logs in error events
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

							{form.watch("includeLogs") && (
								<FormField
									control={form.control}
									name="logLines"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Log Lines</FormLabel>
											<FormControl>
												<Input
													type="number"
													min={1}
													max={1000}
													{...field}
													onChange={(e) =>
														field.onChange(parseInt(e.target.value))
													}
												/>
											</FormControl>
											<FormDescription>
												Number of log lines to include (1-1000)
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							<FormField
								control={form.control}
								name="minimumSeverity"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Minimum Severity</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select severity level" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="all">All Events</SelectItem>
												<SelectItem value="warning">Warning & Error</SelectItem>
												<SelectItem value="error">Error Only</SelectItem>
											</SelectContent>
										</Select>
										<FormDescription>
											Only trigger webhook for events matching this severity
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="space-y-2">
								<Label>Branch Filtering</Label>
								<div className="space-y-2">
									{watchBranches.map((branch, index) => (
										<div key={index} className="flex items-center gap-2">
											<Input
												value={branch}
												onChange={(e) => {
													const newBranches = [...watchBranches];
													newBranches[index] = e.target.value;
													form.setValue("branches", newBranches);
												}}
												placeholder="Branch name"
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => {
													const newBranches = watchBranches.filter(
														(_, i) => i !== index,
													);
													form.setValue("branches", newBranches);
												}}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											form.setValue("branches", [...watchBranches, ""]);
										}}
									>
										<Plus className="h-4 w-4 mr-2" />
										Add Branch Filter
									</Button>
								</div>
								<p className="text-sm text-muted-foreground">
									Only trigger for deployments from these branches
								</p>
							</div>

							<FormField
								control={form.control}
								name="transformScript"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Transform Script
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<Info className="h-3 w-3 ml-2 inline" />
													</TooltipTrigger>
													<TooltipContent>
														<p>JavaScript function to transform the payload</p>
														<p>
															Function signature: (payload, context) =&gt;
															payload
														</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</FormLabel>
										<FormControl>
											<Textarea
												placeholder="return { ...payload, custom: 'value' };"
												className="font-mono"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Optional JavaScript to transform the payload
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</AccordionContent>
					</AccordionItem>
				</Accordion>

				<Button type="submit">Save Configuration</Button>
			</form>
		</Form>
	);
}

interface SlackConfigFormProps {
	config?: SlackConfig;
	onSubmit: (config: SlackConfig) => void;
}

export function SlackConfigForm({ config, onSubmit }: SlackConfigFormProps) {
	const form = useForm<SlackConfig>({
		resolver: zodResolver(slackConfigSchema),
		defaultValues: config || {
			url: "",
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
		},
	});

	const watchCustomActions = form.watch("customActions") || [];

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
				<FormField
					control={form.control}
					name="url"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Webhook URL *</FormLabel>
							<FormControl>
								<Input
									placeholder="https://hooks.slack.com/services/xxx"
									{...field}
								/>
							</FormControl>
							<FormDescription>
								Slack incoming webhook URL from your workspace
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="channel"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Channel Override (Optional)</FormLabel>
							<FormControl>
								<Input placeholder="#deployment-alerts" {...field} />
							</FormControl>
							<FormDescription>
								Override the default channel (if allowed by webhook)
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<Accordion type="single" collapsible className="w-full">
					<AccordionItem value="notifications">
						<AccordionTrigger>Notification Settings</AccordionTrigger>
						<AccordionContent className="space-y-4">
							<div className="space-y-4 rounded-lg border p-4">
								<h4 className="text-sm font-medium">Mention Settings</h4>

								<FormField
									control={form.control}
									name="mentionOn.failure"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between">
											<FormLabel>Mention on Failure</FormLabel>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="mentionOn.success"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between">
											<FormLabel>Mention on Success</FormLabel>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>

								<div className="space-y-2">
									<Label>User Mentions</Label>
									{(form.watch("mentionOn.users") || []).map((user, index) => (
										<div key={index} className="flex items-center gap-2">
											<Input
												value={user}
												onChange={(e) => {
													const users = form.watch("mentionOn.users") || [];
													users[index] = e.target.value;
													form.setValue("mentionOn.users", users);
												}}
												placeholder="U1234567890"
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => {
													const users = form.watch("mentionOn.users") || [];
													form.setValue(
														"mentionOn.users",
														users.filter((_, i) => i !== index),
													);
												}}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											const users = form.watch("mentionOn.users") || [];
											form.setValue("mentionOn.users", [...users, ""]);
										}}
									>
										<Plus className="h-4 w-4 mr-2" />
										Add User
									</Button>
									<p className="text-xs text-muted-foreground">
										Slack user IDs to mention
									</p>
								</div>
							</div>

							<FormField
								control={form.control}
								name="threadingEnabled"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Enable Threading</FormLabel>
											<FormDescription>
												Group related messages in threads
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

							{form.watch("threadingEnabled") && (
								<FormField
									control={form.control}
									name="threadingStrategy"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Threading Strategy</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="per-app">
														Per Application
													</SelectItem>
													<SelectItem value="per-deployment">
														Per Deployment
													</SelectItem>
													<SelectItem value="per-day">Per Day</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
						</AccordionContent>
					</AccordionItem>

					<AccordionItem value="appearance">
						<AccordionTrigger>Appearance</AccordionTrigger>
						<AccordionContent className="space-y-4">
							<FormField
								control={form.control}
								name="colorScheme"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Color Scheme</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="default">Default</SelectItem>
												<SelectItem value="custom">Custom</SelectItem>
												<SelectItem value="monochrome">Monochrome</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="logoUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Logo URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://example.com/logo.png"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Custom logo to display in messages
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="includeGraphs"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Include Graphs</FormLabel>
											<FormDescription>
												Show visual metrics using Unicode blocks
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

					<AccordionItem value="content">
						<AccordionTrigger>Content Options</AccordionTrigger>
						<AccordionContent className="space-y-4">
							<FormField
								control={form.control}
								name="includeMetrics"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Include Metrics</FormLabel>
											<FormDescription>Show deployment metrics</FormDescription>
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

							<FormField
								control={form.control}
								name="includeCommitHistory"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Include Commit History</FormLabel>
											<FormDescription>Show recent commits</FormDescription>
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

							{form.watch("includeCommitHistory") && (
								<FormField
									control={form.control}
									name="maxCommits"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Max Commits</FormLabel>
											<FormControl>
												<Input
													type="number"
													min={1}
													max={20}
													{...field}
													onChange={(e) =>
														field.onChange(parseInt(e.target.value))
													}
												/>
											</FormControl>
											<FormDescription>
												Maximum number of commits to show (1-20)
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							<FormField
								control={form.control}
								name="includeChangelog"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Include Changelog</FormLabel>
											<FormDescription>
												Show what changed in this deployment
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

					<AccordionItem value="actions">
						<AccordionTrigger>Action Buttons</AccordionTrigger>
						<AccordionContent className="space-y-4">
							<FormField
								control={form.control}
								name="enableActions"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Enable Actions</FormLabel>
											<FormDescription>
												Show action buttons in messages
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

							{form.watch("enableActions") && (
								<div className="space-y-2">
									<Label>Custom Actions</Label>
									{watchCustomActions.map((action, index) => (
										<div
											key={index}
											className="space-y-2 rounded-lg border p-3"
										>
											<Input
												value={action.text || ""}
												onChange={(e) => {
													const actions = [...watchCustomActions];
													actions[index] = {
														text: e.target.value,
														url: actions[index]?.url || "",
														style: actions[index]?.style || "default",
													};
													form.setValue("customActions", actions);
												}}
												placeholder="Button text"
											/>
											<Input
												value={action.url || ""}
												onChange={(e) => {
													const actions = [...watchCustomActions];
													actions[index] = {
														text: actions[index]?.text || "",
														url: e.target.value,
														style: actions[index]?.style || "default",
													};
													form.setValue("customActions", actions);
												}}
												placeholder="https://example.com/action"
											/>
											<div className="flex items-center justify-between">
												<Select
													value={action.style || "default"}
													onValueChange={(
														value: "default" | "primary" | "danger",
													) => {
														const actions = [...watchCustomActions];
														actions[index] = {
															text: actions[index]?.text || "",
															url: actions[index]?.url || "",
															style: value,
														};
														form.setValue("customActions", actions);
													}}
												>
													<SelectTrigger className="w-32">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="default">Default</SelectItem>
														<SelectItem value="primary">Primary</SelectItem>
														<SelectItem value="danger">Danger</SelectItem>
													</SelectContent>
												</Select>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => {
														form.setValue(
															"customActions",
															watchCustomActions.filter((_, i) => i !== index),
														);
													}}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
									))}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											form.setValue("customActions", [
												...watchCustomActions,
												{ text: "", url: "", style: "default" },
											]);
										}}
									>
										<Plus className="h-4 w-4 mr-2" />
										Add Custom Action
									</Button>
								</div>
							)}
						</AccordionContent>
					</AccordionItem>
				</Accordion>

				<Button type="submit">Save Configuration</Button>
			</form>
		</Form>
	);
}
