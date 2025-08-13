import { Loader2, Plus, Webhook } from "lucide-react";
import { toast } from "sonner";
import {
	WebhookDialog as Dialog,
	WebhookDialogContent as DialogContent,
	WebhookDialogDescription as DialogDescription,
	WebhookDialogFooter as DialogFooter,
	WebhookDialogHeader as DialogHeader,
	WebhookDialogTitle as DialogTitle,
	WebhookDialogTrigger as DialogTrigger,
} from "./webhook-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { WebhookForm, type WebhookFormValues } from "./webhook-form";
import { useState } from "react";

interface WebhookCreateModalProps {
	applicationId?: string;
	composeId?: string;
	trigger?: React.ReactNode;
	onSuccess?: () => void;
}

export const WebhookCreateModal = ({
	applicationId,
	composeId,
	trigger,
	onSuccess,
}: WebhookCreateModalProps) => {
	const [open, setOpen] = useState(false);
	
	const { mutateAsync: createWebhook, isLoading: isCreating } =
		api.webhook.create.useMutation();

	const handleSubmit = async (values: WebhookFormValues) => {
		try {
			await createWebhook({
				...values,
				applicationId,
				composeId,
			});
			toast.success("Webhook created successfully");
			setOpen(false);
			onSuccess?.();
		} catch (error) {
			console.error(error);
			toast.error("Failed to create webhook");
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
			<DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Webhook className="size-5" />
						Create Webhook
					</DialogTitle>
					<DialogDescription>
						Configure a new webhook for deployment notifications
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto py-4">
					<WebhookForm
						onSubmit={handleSubmit}
						isSubmitting={isCreating}
						formId="create-webhook-form"
					/>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
					>
						Cancel
					</Button>
					<Button
						form="create-webhook-form"
						type="submit"
						disabled={isCreating}
					>
						{isCreating ? (
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
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};