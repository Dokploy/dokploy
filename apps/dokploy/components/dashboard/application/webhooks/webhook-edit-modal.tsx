import { Loader2, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	WebhookDialog as Dialog,
	WebhookDialogContent as DialogContent,
	WebhookDialogDescription as DialogDescription,
	WebhookDialogFooter as DialogFooter,
	WebhookDialogHeader as DialogHeader,
	WebhookDialogTitle as DialogTitle,
} from "./webhook-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { WebhookForm, type WebhookFormValues } from "./webhook-form";

interface WebhookEditModalProps {
	webhookId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: () => void;
}

export const WebhookEditModal = ({
	webhookId,
	open,
	onOpenChange,
	onSuccess,
}: WebhookEditModalProps) => {
	const [isDeleting, setIsDeleting] = useState(false);
	

	const { data: existingWebhook, isLoading: isLoadingWebhook } =
		api.webhook.findById.useQuery(
			{ webhookId },
			{ enabled: open && !!webhookId && webhookId !== "" }
		);

	const { mutateAsync: updateWebhook, isLoading: isUpdating } =
		api.webhook.update.useMutation();

	const { mutateAsync: deleteWebhook } = api.webhook.delete.useMutation();

	const handleDelete = async () => {
		if (!confirm("Are you sure you want to delete this webhook?")) return;
		
		setIsDeleting(true);
		try {
			await deleteWebhook({ webhookId });
			toast.success("Webhook deleted successfully");
			onOpenChange(false);
			onSuccess?.();
		} catch (error) {
			console.error(error);
			toast.error("Failed to delete webhook");
		} finally {
			setIsDeleting(false);
		}
	};

	const handleSubmit = async (values: WebhookFormValues) => {
		try {
			await updateWebhook({
				webhookId,
				...values,
			});
			toast.success("Webhook updated successfully");
			onOpenChange(false);
			onSuccess?.();
		} catch (error) {
			console.error(error);
			toast.error("Failed to update webhook");
		}
	};

	const initialData: WebhookFormValues | undefined = existingWebhook
		? {
				name: existingWebhook.name,
				url: existingWebhook.url,
				secret: existingWebhook.secret || undefined, // Keep undefined if no secret
				templateType: existingWebhook.templateType as any,
				customTemplate: existingWebhook.customTemplate || "",
				events: existingWebhook.events as any,
				headers: existingWebhook.headers as any,
				enabled: existingWebhook.enabled,
		  }
		: undefined;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Webhook className="size-5" />
						Edit Webhook
					</DialogTitle>
					<DialogDescription>
						Update your webhook configuration
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto py-4">
						{isLoadingWebhook ? (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="size-6 animate-spin text-muted-foreground" />
							</div>
						) : initialData ? (
							<WebhookForm
								initialData={initialData}
								onSubmit={handleSubmit}
								isSubmitting={isUpdating}
								formId="edit-webhook-form"
							/>
						) : null}
				</div>

				<DialogFooter>
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
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button
								form="edit-webhook-form"
								type="submit"
								disabled={isUpdating || isLoadingWebhook}
							>
								{isUpdating ? (
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
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};