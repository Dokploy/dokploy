import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import {
	clearReauthContext,
	isSensitiveVerificationPending,
	resolveSensitiveVerification,
	saveReauthContext,
	subscribeSensitiveVerification,
	takeReauthContext,
} from "@/lib/sensitive-action";
import { api } from "@/utils/api";

const useRestoreOrganizationAfterReauth = () => {
	const utils = api.useUtils();

	useEffect(() => {
		const context = takeReauthContext();
		if (!context) return;

		const restore = async () => {
			const { data } = await authClient.getSession();
			if (!data) return;
			if (data.user.id !== context.userId) {
				toast.error(
					"You signed in with a different account. The action was not verified.",
				);
				return;
			}
			if (data.session.activeOrganizationId !== context.organizationId) {
				await authClient.organization.setActive({
					organizationId: context.organizationId,
				});
				await utils.invalidate();
			}
		};
		restore().catch(() => {});
	}, [utils]);
};

const prepareReauth = async () => {
	const { data } = await authClient.getSession();
	if (data?.session.activeOrganizationId) {
		saveReauthContext({
			organizationId: data.session.activeOrganizationId,
			userId: data.user.id,
		});
	}
};

export const SensitiveActionDialog = () => {
	const open = useSyncExternalStore(
		subscribeSensitiveVerification,
		isSensitiveVerificationPending,
		() => false,
	);
	const [password, setPassword] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [isRedirecting, setIsRedirecting] = useState(false);

	useRestoreOrganizationAfterReauth();

	const {
		data: methods,
		isLoading,
		isError,
	} = api.sensitiveAction.methods.useQuery(undefined, { enabled: open });
	const verifyPassword = api.sensitiveAction.verifyPassword.useMutation();

	useEffect(() => {
		if (!open) {
			setPassword("");
			setTotpCode("");
			verifyPassword.reset();
		}
	}, [open]);

	const onPasswordSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		try {
			await verifyPassword.mutateAsync({
				password,
				totpCode: methods?.requiresTotp ? totpCode : undefined,
			});
			resolveSensitiveVerification(true);
		} catch {}
	};

	const onPasskey = async () => {
		setIsRedirecting(true);
		try {
			await prepareReauth();
			const { error } = await authClient.signIn.passkey();
			if (error) {
				const code = "code" in error ? error.code : undefined;
				if (code !== "AUTH_CANCELLED" && code !== "ERROR_CEREMONY_ABORTED") {
					toast.error(error.message || "Passkey verification failed");
				}
				clearReauthContext();
				setIsRedirecting(false);
				return;
			}
			window.location.reload();
		} catch {
			toast.error("Passkey verification failed");
			clearReauthContext();
			setIsRedirecting(false);
		}
	};

	const onSSO = async (providerId: string) => {
		setIsRedirecting(true);
		try {
			await prepareReauth();
			const { data, error } = await authClient.signIn.sso({
				providerId,
				callbackURL: window.location.pathname + window.location.search,
			});
			if (error || !data?.url) {
				toast.error(error?.message || "Failed to start SSO sign-in");
				clearReauthContext();
				setIsRedirecting(false);
				return;
			}
			window.location.href = data.url;
		} catch {
			toast.error("Failed to start SSO sign-in");
			clearReauthContext();
			setIsRedirecting(false);
		}
	};

	const onSocial = async (provider: "github" | "google") => {
		setIsRedirecting(true);
		try {
			await prepareReauth();
			const returnTo = window.location.pathname + window.location.search;
			const { error } = await authClient.signIn.social({
				provider,
				callbackURL: returnTo,
				errorCallbackURL: returnTo,
			});
			if (error) {
				toast.error(error.message || "Failed to start sign-in");
				clearReauthContext();
				setIsRedirecting(false);
			}
		} catch {
			toast.error("Failed to start sign-in");
			clearReauthContext();
			setIsRedirecting(false);
		}
	};

	const hasRelogin =
		!!methods?.passkey ||
		!!methods?.ssoProviderId ||
		!!methods?.socialProviders.length;
	const hasAnyMethod = !!methods?.password || hasRelogin;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && !isRedirecting) resolveSensitiveVerification(false);
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheck className="size-5 text-muted-foreground" />
						Confirm your identity
					</DialogTitle>
					<DialogDescription>
						This action is sensitive. Confirm it's you to continue. You won't be
						asked again for the next 5 minutes.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading...</p>
				) : isError ? (
					<p className="text-sm text-destructive">
						Could not load your verification methods. Try again.
					</p>
				) : !hasAnyMethod ? (
					<p className="text-sm text-muted-foreground">
						No verification method is available for your account. Sign out and
						sign in again, then retry the action.
					</p>
				) : (
					<div className="flex flex-col gap-4">
						{methods?.password && (
							<form onSubmit={onPasswordSubmit} className="flex flex-col gap-3">
								<div className="flex flex-col gap-2">
									<Label htmlFor="sensitive-action-password">Password</Label>
									<Input
										id="sensitive-action-password"
										type="password"
										autoComplete="current-password"
										autoFocus
										value={password}
										onChange={(event) => setPassword(event.target.value)}
									/>
								</div>
								{methods.requiresTotp && (
									<div className="flex flex-col gap-2">
										<Label>Authenticator code</Label>
										<InputOTP
											maxLength={6}
											value={totpCode}
											onChange={setTotpCode}
										>
											<InputOTPGroup>
												<InputOTPSlot index={0} />
												<InputOTPSlot index={1} />
												<InputOTPSlot index={2} />
											</InputOTPGroup>
											<InputOTPSeparator />
											<InputOTPGroup>
												<InputOTPSlot index={3} />
												<InputOTPSlot index={4} />
												<InputOTPSlot index={5} />
											</InputOTPGroup>
										</InputOTP>
										<p className="text-xs text-muted-foreground">
											Backup codes are not accepted here.
										</p>
									</div>
								)}
								{verifyPassword.error && (
									<p className="text-sm text-destructive">
										{verifyPassword.error.message}
									</p>
								)}
								<Button
									type="submit"
									isLoading={verifyPassword.isPending}
									disabled={
										!password || (methods.requiresTotp && totpCode.length < 6)
									}
								>
									<KeyRound className="size-4" />
									Confirm
								</Button>
							</form>
						)}

						{methods?.password && hasRelogin && (
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<div className="h-px flex-1 bg-border" />
								or
								<div className="h-px flex-1 bg-border" />
							</div>
						)}

						{methods?.passkey && (
							<Button
								variant="outline"
								onClick={onPasskey}
								disabled={isRedirecting}
							>
								<Fingerprint className="size-4" />
								Use a passkey
							</Button>
						)}

						{methods?.ssoProviderId && (
							<Button
								variant="outline"
								onClick={() => onSSO(methods.ssoProviderId as string)}
								disabled={isRedirecting}
							>
								Continue with SSO
							</Button>
						)}

						{methods?.socialProviders.map((provider) => (
							<Button
								key={provider}
								variant="outline"
								onClick={() => onSocial(provider)}
								disabled={isRedirecting}
							>
								Continue with {provider === "github" ? "GitHub" : "Google"}
							</Button>
						))}

						{hasRelogin && (
							<p className="text-xs text-muted-foreground">
								Signing in again reloads the page. Retry the action afterwards.
							</p>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => resolveSensitiveVerification(false)}
						disabled={isRedirecting}
					>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
