import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import {
	getPasskeyErrorMessage,
	getPasskeyOriginPreflightError,
	isPasskeyCeremonyAbort,
	isPasskeyNotAllowed,
	preemptConditionalPasskeyCeremony,
	runPasskeyCeremony,
	settleWebAuthnSlot,
} from "@/lib/passkey-ceremony";

type UserPasskey = {
	id: string;
	name: string | null;
	createdAt: Date | string;
	deviceType?: string;
};

type AuthenticatorAttachment = "platform" | "cross-platform";

export const ManagePasskeys = () => {
	const [passkeys, setPasskeys] = useState<UserPasskey[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [passkeyName, setPasskeyName] = useState("");
	const [isAdding, setIsAdding] = useState(false);
	const [authenticatorAttachment, setAuthenticatorAttachment] =
		useState<AuthenticatorAttachment>("platform");
	const [deleteTarget, setDeleteTarget] = useState<UserPasskey | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const loadGenerationRef = useRef(0);

	const loadPasskeys = useCallback(async () => {
		const generation = ++loadGenerationRef.current;
		setIsLoading(true);
		try {
			const { data, error } = await authClient.passkey.listUserPasskeys();
			if (generation !== loadGenerationRef.current) return;
			if (error) {
				throw new Error(error.message ?? "Failed to load passkeys");
			}
			setPasskeys((data ?? []) as UserPasskey[]);
		} catch (error) {
			if (generation !== loadGenerationRef.current) return;
			toast.error(
				error instanceof Error ? error.message : "Failed to load passkeys",
			);
			setPasskeys([]);
		} finally {
			if (generation === loadGenerationRef.current) {
				setIsLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		void loadPasskeys();
	}, [loadPasskeys]);

	const startAddPasskeyCeremony = async () => {
		const name = passkeyName.trim() || undefined;
		setIsAdding(true);
		toast.info("Waiting for device passkey prompt…");

		preemptConditionalPasskeyCeremony();
		await settleWebAuthnSlot();

		try {
			await runPasskeyCeremony(async () => {
				try {
					const { error } = await authClient.passkey.addPasskey({
						name,
						authenticatorAttachment,
					});

					if (error) {
						throw new Error(
							getPasskeyErrorMessage({ error, flow: "register" }),
						);
					}
				} catch (err) {
					if (isPasskeyCeremonyAbort(err)) {
						throw err;
					}
					if (isPasskeyNotAllowed(err)) {
						throw new Error(
							getPasskeyErrorMessage({
								error: { code: "UNKNOWN_ERROR" },
								caught: err,
								flow: "register",
							}),
						);
					}
					throw err;
				}
			});

			toast.success("Passkey added successfully");
			setPasskeyName("");
			setAuthenticatorAttachment("platform");
			await loadPasskeys();
		} catch (error) {
			if (isPasskeyCeremonyAbort(error)) return;
			toast.error(
				getPasskeyErrorMessage({
					error: {
						message: error instanceof Error ? error.message : undefined,
					},
					caught: error,
					flow: "register",
				}),
			);
		} finally {
			setIsAdding(false);
		}
	};

	const handleDialogOpenChange = (open: boolean) => {
		setIsDialogOpen(open);
	};

	const handleAddPasskeyClick = () => {
		const originError = getPasskeyOriginPreflightError();
		if (originError) {
			toast.error(originError);
			return;
		}

		setIsDialogOpen(false);
		// Close the dialog before WebAuthn; double rAF ensures the overlay is gone.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				void startAddPasskeyCeremony();
			});
		});
	};

	const handleDeletePasskey = async () => {
		if (!deleteTarget || isAdding) return;
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

	const ceremonyInFlight = isAdding || isDeleting;

	return (
		<>
			<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
				<DialogTrigger asChild>
					<Button variant="ghost" disabled={ceremonyInFlight}>
						<KeyRound className="size-4 text-muted-foreground" />
						Manage passkeys
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Passkeys</DialogTitle>
						<DialogDescription>
							Register passkeys for passwordless sign-in. Platform passkeys use
							Touch ID or Windows Hello; security keys are cross-platform
							devices like YubiKey.
						</DialogDescription>
					</DialogHeader>

					<p className="text-xs text-muted-foreground">
						Passkeys require HTTPS in production and must be registered on the
						same site URL you use to sign in.
					</p>

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
											disabled={isAdding}
											onClick={() => {
												if (isAdding) return;
												setDeleteTarget(item);
											}}
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
							onClick={handleAddPasskeyClick}
							disabled={isAdding}
						>
							<Plus className="size-4 mr-2" />
							Add passkey
						</Button>

						{authenticatorAttachment === "platform" ? (
							<button
								type="button"
								className="text-sm text-muted-foreground hover:underline w-full text-center"
								onClick={() => setAuthenticatorAttachment("cross-platform")}
							>
								Use security key instead
							</button>
						) : (
							<button
								type="button"
								className="text-sm text-muted-foreground hover:underline w-full text-center"
								onClick={() => setAuthenticatorAttachment("platform")}
							>
								Use Touch ID / Windows Hello instead
							</button>
						)}
					</div>
				</DialogContent>
			</Dialog>

			{isAdding ? (
				<p className="text-xs text-muted-foreground mt-1">
					Waiting for device passkey prompt…
				</p>
			) : null}

			<AlertDialog
				open={deleteTarget !== null && !isAdding}
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
							disabled={isDeleting || isAdding}
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
