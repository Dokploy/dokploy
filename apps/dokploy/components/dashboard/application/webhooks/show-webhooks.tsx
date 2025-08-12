import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { formatRelative } from "date-fns";
import {
	Activity,
	AlertCircle,
	CheckCircle2,
	Clock,
	Edit,
	ExternalLink,
	Loader2,
	MoreVertical,
	Plus,
	Send,
	Trash2,
	Webhook,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HandleWebhook } from "./handle-webhook";
import { ShowWebhookDeliveries } from "./show-webhook-deliveries";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

interface Props {
	applicationId?: string;
	composeId?: string;
}

export const ShowWebhooks = ({ applicationId, composeId }: Props) => {
	const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
	const [showDeliveries, setShowDeliveries] = useState(false);
	const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);

	const {
		data: webhooks,
		isLoading: isLoadingWebhooks,
		refetch: refetchWebhooks,
	} = applicationId
		? api.webhook.findByApplication.useQuery(
				{ applicationId },
				{ enabled: !!applicationId }
		  )
		: api.webhook.findByCompose.useQuery(
				{ composeId: composeId! },
				{ enabled: !!composeId }
		  );

	const utils = api.useUtils();

	const { mutateAsync: deleteWebhook, isLoading: isDeleting } =
		api.webhook.delete.useMutation();

	const { mutateAsync: testWebhook, isLoading: isTesting } =
		api.webhook.test.useMutation();

	const { mutateAsync: toggleWebhook, isLoading: isToggling } =
		api.webhook.toggle.useMutation();

	const handleDelete = async (webhookId: string) => {
		try {
			await deleteWebhook({ webhookId });
			toast.success("Webhook deleted successfully");
			refetchWebhooks();
		} catch (error) {
			toast.error("Failed to delete webhook");
		}
	};

	const handleTest = async (webhookId: string) => {
		try {
			await testWebhook({ webhookId });
			toast.success("Test webhook sent successfully");
		} catch (error) {
			toast.error(`Failed to send test webhook: ${(error as Error).message}`);
		}
	};

	const handleToggle = async (webhookId: string, enabled: boolean) => {
		try {
			await toggleWebhook({ webhookId, enabled });
			toast.success(enabled ? "Webhook enabled" : "Webhook disabled");
			refetchWebhooks();
		} catch (error) {
			toast.error("Failed to toggle webhook");
		}
	};

	const getEventBadgeColor = (event: string) => {
		switch (event) {
			case "deployment.started":
				return "default";
			case "deployment.success":
				return "success";
			case "deployment.failed":
				return "destructive";
			case "deployment.cancelled":
				return "secondary";
			default:
				return "outline";
		}
	};

	const getTemplateBadgeColor = (template: string) => {
		switch (template) {
			case "slack":
				return "purple";
			case "n8n":
				return "orange";
			default:
				return "default";
		}
	};

	return (
		<>
			<Card className="border px-6 shadow-none bg-transparent h-full min-h-[50vh]">
				<CardHeader className="px-0">
					<div className="flex justify-between items-center">
						<div className="flex flex-col gap-2">
							<CardTitle className="text-xl font-bold flex items-center gap-2">
								<Webhook className="size-5" />
								Webhook Management
							</CardTitle>
							<CardDescription>Configure webhooks for deployment notifications</CardDescription>
						</div>

						<HandleWebhook
							applicationId={applicationId}
							composeId={composeId}
							webhookId={editingWebhookId}
							onClose={() => {
								setEditingWebhookId(null);
								refetchWebhooks();
							}}
						/>
					</div>
				</CardHeader>
				<CardContent className="px-0">
					{isLoadingWebhooks ? (
						<div className="flex gap-4 w-full items-center justify-center text-center mx-auto min-h-[45vh]">
							<Loader2 className="size-4 text-muted-foreground/70 transition-colors animate-spin self-center" />
							<span className="text-sm text-muted-foreground/70">
								Loading webhooks...
							</span>
						</div>
					) : webhooks && webhooks.length > 0 ? (
						<div className="space-y-4">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>URL</TableHead>
										<TableHead>Template</TableHead>
										<TableHead>Events</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{webhooks.map((webhook) => (
										<TableRow key={webhook.webhookId}>
											<TableCell className="font-medium">
												{webhook.name}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-1">
													<span className="text-xs text-muted-foreground truncate max-w-[200px]">
														{webhook.url}
													</span>
													<ExternalLink className="size-3 text-muted-foreground" />
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant={
														getTemplateBadgeColor(
															webhook.templateType
														) as any
													}
												>
													{webhook.templateType}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{(webhook.events as string[]).map((event) => (
														<Badge
															key={event}
															variant={
																getEventBadgeColor(event) as any
															}
															className="text-xs"
														>
															{event.replace("deployment.", "")}
														</Badge>
													))}
												</div>
											</TableCell>
											<TableCell>
												<Switch
													checked={webhook.enabled}
													onCheckedChange={(checked) =>
														handleToggle(webhook.webhookId, checked)
													}
													disabled={isToggling}
												/>
											</TableCell>
											<TableCell className="text-right">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															className="size-8"
														>
															<MoreVertical className="size-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() =>
																handleTest(webhook.webhookId)
															}
															disabled={isTesting || !webhook.enabled}
														>
															<Send className="size-4 mr-2" />
															Send Test
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={(e) => {
																e.preventDefault();
																setSelectedWebhookId(
																	webhook.webhookId
																);
																setShowDeliveries(true);
															}}
														>
															<Activity className="size-4 mr-2" />
															Delivery History
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={(e) => {
																e.preventDefault();
																setEditingWebhookId(
																	webhook.webhookId
																);
															}}
														>
															<Edit className="size-4 mr-2" />
															Edit
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DialogAction
															title="Delete"
															description={`Are you sure you want to delete the webhook "${webhook.name}"?`}
															onClick={() =>
																handleDelete(webhook.webhookId)
															}
															trigger={
																<DropdownMenuItem
																	onSelect={(e) => e.preventDefault()}
																	className="text-destructive"
																>
																	<Trash2 className="size-4 mr-2" />
																	Delete
																</DropdownMenuItem>
															}
														/>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className="flex flex-col gap-4 w-full items-center justify-center text-center mx-auto min-h-[45vh]">
							<Webhook className="size-8 text-muted-foreground/50" />
							<div className="flex flex-col gap-2">
								<span className="text-sm text-muted-foreground">
									No webhooks configured
								</span>
								<span className="text-xs text-muted-foreground/70">
									Create your first webhook to receive deployment notifications
								</span>
							</div>
							<HandleWebhook
								applicationId={applicationId}
								composeId={composeId}
								onClose={() => refetchWebhooks()}
								trigger={
									<Button size="sm" variant="outline">
										<Plus className="size-4 mr-2" />
										Create Webhook
									</Button>
								}
							/>
						</div>
					)}
				</CardContent>
			</Card>

			{showDeliveries && selectedWebhookId && (
				<ShowWebhookDeliveries
					webhookId={selectedWebhookId}
					open={showDeliveries}
					onClose={() => {
						setShowDeliveries(false);
						setSelectedWebhookId(null);
					}}
				/>
			)}
		</>
	);
};