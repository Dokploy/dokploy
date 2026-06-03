import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type UserPasskey = {
	id: string;
	name: string | null;
	createdAt: Date | string;
	deviceType?: string;
};

export const ManagePasskeys = () => {
	const [passkeys, setPasskeys] = useState<UserPasskey[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [passkeyName, setPasskeyName] = useState("");
	const [isAdding, setIsAdding] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<UserPasskey | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const loadPasskeys = useCallback(async () => {
		setIsLoading(true);
		try {
			const { data, error } = await authClient.passkey.listUserPasskeys();
			if (error) {
				throw new Error(error.message ?? "Failed to load passkeys");
			}
			setPasskeys((data ?? []) as UserPasskey[]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to load passkeys",
			);
			setPasskeys([]);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadPasskeys();
	}, [loadPasskeys]);

	const handleAddPasskey = async () => {
		setIsAdding(true);
		try {
			const { error } = await authClient.passkey.addPasskey({
				name: passkeyName.trim() || undefined,
			});

			if (error) {
				throw new Error(error.message ?? "Failed to register passkey");
			}

			toast.success("Passkey added successfully");
			setIsDialogOpen(false);
			setPasskeyName("");
			await loadPasskeys();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to register passkey",
			);
		} finally {
			setIsAdding(false);
		}
	};

	const handleDeletePasskey = async () => {
		if (!deleteTarget) return;
		setIsDeleting(true);
		try {
			const { error } = await authClient.passkey.deletePasskey({
				id: deleteTarget.id,
			});

			if (error) {
				throw new Error(error.message ?? "Failed to delete passkey");
			}

			toast.success("Passkey removed");
			setDeleteTarget(null);
			await loadPasskeys();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete passkey",
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const formatCreatedAt = (value: Date | string) => {
		const date = value instanceof Date ? value : new Date(value);
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<>
			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogTrigger asChild>
					<Button variant="ghost">
						<KeyRound className="size-4 text-muted-foreground" />
						Manage passkeys
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Passkeys</DialogTitle>
						<DialogDescription>
							Register passkeys for passwordless sign-in on this device or a
							security key.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						{isLoading ? (
							<p className="text-sm text-muted-foreground">Loading passkeys…</p>
						) : passkeys.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No passkeys registered yet.
							</p>
						) : (
							<ul className="divide-y rounded-lg border">
								{passkeys.map((item) => (
									<li
										key={item.id}
										className="flex items-center justify-between gap-3 p-3"
									>
										<div className="min-w-0">
											<p className="font-medium truncate">
												{item.name || "Unnamed passkey"}
											</p>
											<p className="text-xs text-muted-foreground">
												Added {formatCreatedAt(item.createdAt)}
												{item.deviceType ? ` · ${item.deviceType}` : null}
											</p>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => setDeleteTarget(item)}
											aria-label={`Remove passkey ${item.name ?? item.id}`}
										>
											<Trash2 className="size-4 text-destructive" />
										</Button>
									</li>
								))}
							</ul>
						)}

						<div className="space-y-2">
							<Label htmlFor="passkey-name">Passkey name (optional)</Label>
							<Input
								id="passkey-name"
								placeholder="MacBook Touch ID"
								value={passkeyName}
								onChange={(e) => setPasskeyName(e.target.value)}
							/>
						</div>

						<Button
							type="button"
							className="w-full"
							onClick={handleAddPasskey}
							isLoading={isAdding}
						>
							<Plus className="size-4 mr-2" />
							Add passkey
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove passkey?</AlertDialogTitle>
						<AlertDialogDescription>
							{deleteTarget?.name
								? `"${deleteTarget.name}" will no longer work for sign-in.`
								: "This passkey will no longer work for sign-in."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								void handleDeletePasskey();
							}}
							disabled={isDeleting}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
