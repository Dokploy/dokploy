"use client";

import { Link2, Loader2, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

const LINKING_CALLBACK_URL = "/dashboard/settings/profile";

const TRUSTED_PROVIDERS = ["google", "github"] as const;
type SocialProvider = (typeof TRUSTED_PROVIDERS)[number];

type AccountItem = {
	providerId: string;
	accountId?: string;
};

function providerLabel(providerId: string): string {
	return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

export function LinkingAccount() {
	const [accounts, setAccounts] = useState<AccountItem[]>([]);
	const [accountsLoading, setAccountsLoading] = useState(true);
	const [linkingProvider, setLinkingProvider] = useState<SocialProvider | null>(
		null,
	);
	const [unlinkingProviderId, setUnlinkingProviderId] = useState<string | null>(
		null,
	);

	const fetchAccounts = useCallback(async () => {
		setAccountsLoading(true);
		try {
			const { data } = await authClient.listAccounts();
			const list = Array.isArray(data)
				? data
				: ((data && typeof data === "object" && "accounts" in data
						? (data as { accounts?: AccountItem[] }).accounts
						: null) ?? []);
			setAccounts(Array.isArray(list) ? list : []);
		} catch {
			setAccounts([]);
		} finally {
			setAccountsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchAccounts();
	}, [fetchAccounts]);

	const linkedProviderIds = new Set(accounts.map((a) => a.providerId));
	const socialAccounts = accounts.filter((a) =>
		TRUSTED_PROVIDERS.includes(a.providerId as SocialProvider),
	);

	const handleLinkSocial = async (provider: SocialProvider) => {
		setLinkingProvider(provider);
		try {
			const { error } = await authClient.linkSocial({
				provider,
				callbackURL: LINKING_CALLBACK_URL,
			});
			if (error) {
				toast.error(error.message ?? "Failed to link account");
				setLinkingProvider(null);
				return;
			}
		} catch (err) {
			toast.error(
				"Failed to link account",
				err instanceof Error ? { description: err.message } : undefined,
			);
			setLinkingProvider(null);
		}
	};

	const handleUnlink = async (providerId: string, accountId?: string) => {
		setUnlinkingProviderId(providerId);
		try {
			const { error } = await authClient.unlinkAccount({
				providerId,
				...(accountId && { accountId }),
			});
			if (error) {
				toast.error(error.message ?? "Failed to unlink account");
				return;
			}
			toast.success("Account unlinked");
			await fetchAccounts();
		} catch (err) {
			toast.error(
				"Failed to unlink account",
				err instanceof Error ? { description: err.message } : undefined,
			);
		} finally {
			setUnlinkingProviderId(null);
		}
	};

	const canUnlink = accounts.length > 1;

	return (
		<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-6xl mx-auto w-full">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader>
					<div className="flex flex-row gap-2 flex-wrap justify-between items-center">
						<div>
							<CardTitle className="text-xl flex flex-row gap-2">
								<Link2 className="size-6 text-muted-foreground self-center" />
								Linking account
							</CardTitle>
							<CardDescription>
								Link your Google or GitHub account to sign in with them.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-6 py-8 border-t">
					{/* Linked accounts */}
					<div className="space-y-2">
						<p className="text-sm font-medium">Linked accounts</p>
						{accountsLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
								<Loader2 className="size-4 animate-spin" />
								Loading...
							</div>
						) : socialAccounts.length === 0 ? (
							<p className="text-sm text-muted-foreground py-2">
								No social accounts linked yet.
							</p>
						) : (
							<ul className="space-y-2">
								{socialAccounts.map((acc) => (
									<li
										key={acc.accountId ?? acc.providerId}
										className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
									>
										<span className="font-medium">
											{providerLabel(acc.providerId)}
										</span>
										{canUnlink && (
											<Button
												variant="ghost"
												size="sm"
												className="text-destructive hover:text-destructive hover:bg-destructive/10"
												onClick={() =>
													handleUnlink(acc.providerId, acc.accountId)
												}
												disabled={unlinkingProviderId === acc.providerId}
												isLoading={unlinkingProviderId === acc.providerId}
											>
												{unlinkingProviderId === acc.providerId ? (
													<Loader2 className="size-4 animate-spin" />
												) : (
													<>
														<Unlink className="mr-1.5 size-4" />
														Unlink
													</>
												)}
											</Button>
										)}
									</li>
								))}
							</ul>
						)}
					</div>

					<p className="text-sm text-muted-foreground">
						Click a provider below to link it to your account. You will be
						redirected to complete the flow.
					</p>
					<div className="flex flex-wrap gap-3">
						{!linkedProviderIds.has("google") && (
							<Button
								variant="outline"
								type="button"
								className="min-w-[180px]"
								onClick={() => handleLinkSocial("google")}
								disabled={!!linkingProvider}
								isLoading={linkingProvider === "google"}
							>
								{linkingProvider === "google" ? (
									<Loader2 className="mr-2 size-4 animate-spin" />
								) : (
									<svg viewBox="0 0 24 24" className="mr-2 size-4">
										<path
											fill="currentColor"
											d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
										/>
										<path
											fill="currentColor"
											d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
										/>
										<path
											fill="currentColor"
											d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
										/>
										<path
											fill="currentColor"
											d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
										/>
									</svg>
								)}
								Link with Google
							</Button>
						)}
						{!linkedProviderIds.has("github") && (
							<Button
								variant="outline"
								type="button"
								className="min-w-[180px]"
								onClick={() => handleLinkSocial("github")}
								disabled={!!linkingProvider}
								isLoading={linkingProvider === "github"}
							>
								{linkingProvider === "github" ? (
									<Loader2 className="mr-2 size-4 animate-spin" />
								) : (
									<svg
										viewBox="0 0 24 24"
										className="mr-2 size-4"
										fill="currentColor"
									>
										<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
									</svg>
								)}
								Link with GitHub
							</Button>
						)}
					</div>
				</CardContent>
			</div>
		</Card>
	);
}
