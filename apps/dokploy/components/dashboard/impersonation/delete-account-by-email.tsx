import copy from "copy-to-clipboard";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

const CONFIRMATION_WORD = "DELETE";

export const DeleteAccountByEmail = () => {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [record, setRecord] = useState<string | null>(null);
	const { mutateAsync, isPending } =
		api.user.deleteAccountByEmail.useMutation();

	const canConfirm =
		email.trim().length > 0 && confirmation.trim() === CONFIRMATION_WORD;

	const reset = () => {
		setEmail("");
		setConfirmation("");
		setRecord(null);
	};

	const handleDelete = async () => {
		try {
			const result = await mutateAsync({ email: email.trim() });
			setRecord(JSON.stringify(result, null, 2));
			toast.success(`Account ${result.email} deleted`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error deleting account",
			);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				setOpen(value);
				if (!value) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button variant="destructive" className="gap-2">
					<Trash2 className="h-4 w-4" />
					Delete account
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Delete an account by email</DialogTitle>
					<DialogDescription>
						Cancels every Stripe subscription and deletes the user with all the
						organizations they own. Invoices stay in Stripe for accounting. Use
						it to fulfil data deletion requests.
					</DialogDescription>
				</DialogHeader>
				{record ? (
					<div className="flex flex-col gap-3">
						<AlertBlock type="success">
							Deletion completed. Keep this record as evidence of the request
							being fulfilled.
						</AlertBlock>
						<pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-64">
							{record}
						</pre>
						<Button
							variant="outline"
							size="sm"
							className="gap-2 self-end"
							onClick={() => {
								copy(record);
								toast.success("Deletion record copied to clipboard");
							}}
						>
							<Copy className="h-4 w-4" />
							Copy record
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="delete-account-email">Account email</Label>
							<Input
								id="delete-account-email"
								type="email"
								autoComplete="off"
								placeholder="user@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="delete-account-word">
								Type <span className="font-mono">{CONFIRMATION_WORD}</span> to
								confirm
							</Label>
							<Input
								id="delete-account-word"
								autoComplete="off"
								placeholder={CONFIRMATION_WORD}
								value={confirmation}
								onChange={(e) => setConfirmation(e.target.value)}
							/>
						</div>
					</div>
				)}
				<DialogFooter>
					{record ? (
						<Button variant="outline" onClick={() => setOpen(false)}>
							Close
						</Button>
					) : (
						<Button
							variant="destructive"
							disabled={!canConfirm || isPending}
							onClick={handleDelete}
						>
							{isPending && <Loader2 className="h-4 w-4 animate-spin" />}
							Delete account
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
