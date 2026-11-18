import { Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

export const ManagePasskeys = () => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const { data: passkeys, isLoading } = api.user.listPasskeys.useQuery(
		undefined,
		{
			enabled: isDialogOpen,
		},
	);
	const [name, setName] = useState("");
	const [isAdding, setIsAdding] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const handleAddPasskey = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsAdding(true);
		try {
			const result = await authClient.passkey.addPasskey({
				name: name.trim() || undefined,
			});

			if (result?.error) {
				toast.error(result.error.message);
				return;
			}

			toast.success(t("settings.profile.passkeyAdded"));
			setName("");
			utils.user.listPasskeys.invalidate();
		} catch {
			toast.error(t("settings.profile.passkeyAddFailed"));
		} finally {
			setIsAdding(false);
		}
	};

	const handleDeletePasskey = async (id: string) => {
		setDeletingId(id);
		try {
			const result = await authClient.passkey.deletePasskey({ id });

			if (result?.error) {
				toast.error(result.error.message);
				return;
			}

			toast.success(t("settings.profile.passkeyRemoved"));
			utils.user.listPasskeys.invalidate();
		} catch {
			toast.error(t("settings.profile.passkeyRemoveFailed"));
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary">
					<Fingerprint className="size-4 text-muted-foreground" />
					{t("settings.profile.passkeys")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("settings.profile.passkeys")}</DialogTitle>
					<DialogDescription>
						{t("settings.profile.passkeysDescription")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{isLoading ? (
						<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[10vh]">
							<span>{t("settings.profile.loading")}</span>
							<Loader2 className="animate-spin size-4" />
						</div>
					) : passkeys && passkeys.length > 0 ? (
						<div className="grid gap-3">
							{passkeys.map((passkey) => (
								<div
									key={passkey.id}
									className="flex items-center justify-between gap-2 p-4 border rounded-lg"
								>
									<div className="flex flex-col gap-1 min-w-0">
										<span className="font-medium flex items-center gap-2">
											<Fingerprint className="size-4 text-muted-foreground shrink-0" />
											<span className="truncate">
												{passkey.name || t("settings.profile.unnamedPasskey")}
											</span>
											<Badge variant="outline">
												{passkey.deviceType === "singleDevice"
													? t("settings.profile.device")
													: t("settings.profile.synced")}
											</Badge>
										</span>
										{passkey.createdAt && (
											<DateTooltip
												date={passkey.createdAt.toString()}
												className="text-sm"
											>
												{t("settings.profile.added")}
											</DateTooltip>
										)}
									</div>
									<DialogAction
										title={t("settings.profile.removePasskeyTitle")}
										description={t("settings.profile.removePasskeyDescription")}
										onClick={() => handleDeletePasskey(passkey.id)}
									>
										<Button
											variant="ghost"
											size="icon"
											isLoading={deletingId === passkey.id}
											className="text-muted-foreground hover:text-destructive"
										>
											<Trash2 className="size-4" />
										</Button>
									</DialogAction>
								</div>
							))}
						</div>
					) : (
						<div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground border rounded-lg">
							<Fingerprint className="size-6" />
							<span>{t("settings.profile.noPasskeys")}</span>
						</div>
					)}

					<form onSubmit={handleAddPasskey} className="flex flex-col gap-2">
						<Label htmlFor="passkey-name">
							{t("settings.profile.passkeyName")}
						</Label>
						<div className="flex gap-2">
							<Input
								id="passkey-name"
								placeholder={t("settings.profile.passkeyNamePlaceholder")}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
							<Button type="submit" isLoading={isAdding}>
								<Plus className="size-4" />
								{t("settings.profile.addPasskey")}
							</Button>
						</div>
					</form>
				</div>
			</DialogContent>
		</Dialog>
	);
};
