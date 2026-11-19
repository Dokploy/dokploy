import copy from "copy-to-clipboard";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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
			toast.success(t("impersonation.accountDeleted", { email: result.email }));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("impersonation.errorDeletingAccount"),
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
					{t("impersonation.deleteAccount")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{t("impersonation.deleteAccountByEmailTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("impersonation.deleteAccountByEmailDescription")}
					</DialogDescription>
				</DialogHeader>
				{record ? (
					<div className="flex flex-col gap-3">
						<AlertBlock type="success">
							{t("impersonation.deletionCompleted")}
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
								toast.success(t("impersonation.recordCopied"));
							}}
						>
							<Copy className="h-4 w-4" />
							{t("impersonation.copyRecord")}
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="delete-account-email">
								{t("impersonation.accountEmail")}
							</Label>
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
								{t("impersonation.typeToConfirmPrefix")}{" "}
								<span className="font-mono">{CONFIRMATION_WORD}</span>{" "}
								{t("impersonation.typeToConfirmSuffix")}
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
							{t("impersonation.close")}
						</Button>
					) : (
						<Button
							variant="destructive"
							disabled={!canConfirm || isPending}
							onClick={handleDelete}
						>
							{isPending && <Loader2 className="h-4 w-4 animate-spin" />}
							{t("impersonation.deleteAccount")}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
