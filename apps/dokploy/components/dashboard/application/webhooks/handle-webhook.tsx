import { Loader2, Plus, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import {
	WebhookDialog as Dialog,
	WebhookDialogContent as DialogContent,
	WebhookDialogDescription as DialogDescription,
	WebhookDialogFooter as DialogFooter,
	WebhookDialogHeader as DialogHeader,
	WebhookDialogTitle as DialogTitle,
	WebhookDialogTrigger as DialogTrigger,
} from "./webhook-dialog";
import { WebhookForm, type WebhookFormValues } from "./webhook-form";

interface HandleWebhookProps {
	webhookId?: string;
	applicationId?: string;
	composeId?: string;
	trigger?: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: () => void;
}

export const HandleWebhook = ({
	webhookId,
	applicationId,
	composeId,
	trigger,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
	onSuccess,
}: HandleWebhookProps) => {
	// Use internal state for create mode, controlled state for edit mode
	const [internalOpen, setInternalOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const isEditMode = !!webhookId;
	const open = isEditMode ? (controlledOpen ?? false) : internalOpen;
	const setOpen = isEditMode
		? (value: boolean) => controlledOnOpenChange?.(value)
		: setInternalOpen;

	// Fetch existing webhook data in edit mode
	const { data: existingWebhook, isLoading: isLoadingWebhook } =
		api.webhook.findById.useQuery(
			{ webhookId: webhookId || "" },
			{ enabled: isEditMode && open && webhookId !== "" },
		);

	// Mutations
	const { mutateAsync: createWebhook, isLoading: isCreating } =
		api.webhook.create.useMutation();
	const { mutateAsync: updateWebhook, isLoading: isUpdating } =
		api.webhook.update.useMutation();
	const { mutateAsync: deleteWebhook } = api.webhook.delete.useMutation();

	const handleSubmit = async (values: WebhookFormValues) => {
		try {
			if (isEditMode) {
				await updateWebhook({
					webhookId,
					...values,
				});
				toast.success("Webhook updated successfully");
			} else {
				await createWebhook({
					...values,
					applicationId,
					composeId,
				});
				toast.success("Webhook created successfully");
			}
			setOpen(false);
			onSuccess?.();
		} catch (error) {
			console.error(error);
			toast.error(
				isEditMode ? "Failed to update webhook" : "Failed to create webhook",
			);
		}
	};

	const handleDelete = async () => {
		if (!confirm("Are you sure you want to delete this webhook?")) return;

		setIsDeleting(true);
		try {
			await deleteWebhook({ webhookId: webhookId! });
			toast.success("Webhook deleted successfully");
			setOpen(false);
			onSuccess?.();
		} catch (error) {
			console.error(error);
			toast.error("Failed to delete webhook");
		} finally {
			setIsDeleting(false);
		}
	};

	// Prepare initial data for edit mode
	const initialData: WebhookFormValues | undefined =
		isEditMode && existingWebhook
			? {
					name: existingWebhook.name,
					url: existingWebhook.url,
					secret: existingWebhook.secret || undefined,
					templateType: existingWebhook.templateType as any,
					customTemplate: existingWebhook.customTemplate || "",
					events: existingWebhook.events as any,
					headers: existingWebhook.headers as any,
					enabled: existingWebhook.enabled,
				}
			: undefined;

	const isSubmitting = isEditMode ? isUpdating : isCreating;
	const formId = isEditMode ? "edit-webhook-form" : "create-webhook-form";

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{!isEditMode && trigger && (
				<DialogTrigger asChild>{trigger}</DialogTrigger>
			)}
			<DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Webhook className="size-5" />
						{isEditMode ? "Edit Webhook" : "Create Webhook"}
					</DialogTitle>
					<DialogDescription>
						{isEditMode
							? "Update your webhook configuration"
							: "Configure a new webhook for deployment notifications"}
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto py-4">
					{isEditMode && isLoadingWebhook ? (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : isEditMode && !initialData ? null : (
						<WebhookForm
							initialData={initialData}
							onSubmit={handleSubmit}
							isSubmitting={isSubmitting}
							formId={formId}
						/>
					)}
				</div>

				<DialogFooter>
					{isEditMode ? (
						<div className="flex w-full justify-between">
							<Button
								type="button"
								variant="destructive"
								onClick={handleDelete}
								disabled={isDeleting}
							>
								{isDeleting ? (
									<>
										<Loader2 className="size-4 mr-2 animate-spin" />
										Deleting...
									</>
								) : (
									<>
										<Trash2 className="size-4 mr-2" />
										Delete
									</>
								)}
							</Button>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => setOpen(false)}
								>
									Cancel
								</Button>
								<Button
									form={formId}
									type="submit"
									disabled={isSubmitting || isLoadingWebhook}
								>
									{isSubmitting ? (
										<>
											<Loader2 className="size-4 mr-2 animate-spin" />
											Updating...
										</>
									) : (
										"Update Webhook"
									)}
								</Button>
							</div>
						</div>
					) : (
						<>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button form={formId} type="submit" disabled={isSubmitting}>
								{isSubmitting ? (
									<>
										<Loader2 className="size-4 mr-2 animate-spin" />
										Creating...
									</>
								) : (
									<>
										<Plus className="size-4 mr-2" />
										Create Webhook
									</>
								)}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
