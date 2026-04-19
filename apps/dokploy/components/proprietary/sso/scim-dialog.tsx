"use client";

import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
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
import { useUrl } from "@/utils/hooks/use-url";

interface Props {
	children: ReactNode;
}

export const ScimDialog = ({ children }: Props) => {
	const utils = api.useUtils();
	const baseURL = useUrl();
	const [open, setOpen] = useState(false);
	const [newProviderId, setNewProviderId] = useState("");
	const [justCreatedToken, setJustCreatedToken] = useState<{
		providerId: string;
		token: string;
	} | null>(null);

	const { data: providers = [], isPending } = api.scim.listProviders.useQuery(
		undefined,
		{ enabled: open },
	);
	const { mutateAsync: generateToken, isPending: isGenerating } =
		api.scim.generateToken.useMutation();
	const { mutateAsync: deleteProvider, isPending: isDeleting } =
		api.scim.deleteProvider.useMutation();

	const scimUrl = `${baseURL || "{baseURL}"}/api/auth/scim/v2`;

	const handleGenerate = async () => {
		const providerId = newProviderId.trim().toLowerCase();
		if (!providerId) return;
		try {
			const result = await generateToken({ providerId });
			setJustCreatedToken({
				providerId: result.providerId,
				token: result.scimToken,
			});
			setNewProviderId("");
			await utils.scim.listProviders.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to generate SCIM token",
			);
		}
	};

	const handleDelete = async (providerId: string) => {
		try {
			await deleteProvider({ providerId });
			toast.success("SCIM provider removed");
			await utils.scim.listProviders.invalidate();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to delete SCIM provider",
			);
		}
	};

	const handleCopy = async (value: string, label: string) => {
		try {
			await navigator.clipboard.writeText(value);
			toast.success(`${label} copied`);
		} catch {
			toast.error("Failed to copy");
		}
	};

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) setJustCreatedToken(null);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<KeyRound className="size-5" />
						SCIM provisioning
					</DialogTitle>
					<DialogDescription>
						Automatically provision, update, and deactivate users from your
						identity provider (Okta, Entra ID, etc.). Configure the SCIM endpoint
						below in your IdP.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="grid gap-1">
						<Label className="text-xs font-medium text-muted-foreground">
							SCIM 2.0 endpoint URL
						</Label>
						<div className="flex items-center gap-2">
							<p className="flex-1 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
								{scimUrl}
							</p>
							<Button
								variant="outline"
								size="icon"
								className="size-8 shrink-0"
								onClick={() => handleCopy(scimUrl, "Endpoint URL")}
								disabled={!baseURL}
							>
								<Copy className="size-3.5" />
							</Button>
						</div>
					</div>

					{justCreatedToken && (
						<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
							<p className="text-sm font-medium">
								Bearer token for {justCreatedToken.providerId}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Copy this token now — it will not be shown again. Paste it into
								your IdP's SCIM configuration.
							</p>
							<div className="mt-2 flex items-center gap-2">
								<p className="flex-1 break-all rounded-md bg-background px-2 py-1.5 font-mono text-xs">
									{justCreatedToken.token}
								</p>
								<Button
									variant="outline"
									size="icon"
									className="size-8 shrink-0"
									onClick={() =>
										handleCopy(justCreatedToken.token, "Bearer token")
									}
								>
									<Copy className="size-3.5" />
								</Button>
							</div>
						</div>
					)}

					<div className="space-y-2">
						<Label className="text-sm font-medium">
							Generate token for a new provider
						</Label>
						<div className="flex gap-2">
							<Input
								value={newProviderId}
								onChange={(e) => setNewProviderId(e.target.value)}
								placeholder="okta, entra, jumpcloud..."
								className="font-mono text-sm"
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										void handleGenerate();
									}
								}}
							/>
							<Button
								size="sm"
								onClick={handleGenerate}
								disabled={!newProviderId.trim() || isGenerating}
							>
								<Plus className="mr-1 size-4" />
								Generate
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							Choose a unique identifier for this IdP connection (lowercase,
							alphanumeric, dashes).
						</p>
					</div>

					<div className="space-y-2">
						<Label className="text-sm font-medium">Existing providers</Label>
						{isPending ? (
							<div className="flex items-center gap-2 justify-center py-4">
								<Loader2 className="size-4 animate-spin text-muted-foreground" />
								<span className="text-sm text-muted-foreground">Loading...</span>
							</div>
						) : providers.length === 0 ? (
							<p className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
								No SCIM providers configured yet.
							</p>
						) : (
							<ul className="flex flex-col gap-2">
								{providers.map((provider) => (
									<li
										key={provider.id}
										className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
									>
										<span className="flex-1 font-mono text-sm">
											{provider.providerId}
										</span>
										<DialogAction
											title="Remove SCIM provider"
											description={`Remove "${provider.providerId}"? Existing provisioned users will stay but the IdP will no longer be able to sync.`}
											type="destructive"
											onClick={() => handleDelete(provider.providerId)}
										>
											<Button
												variant="ghost"
												size="icon"
												className="size-8 shrink-0 text-destructive hover:text-destructive"
												disabled={isDeleting}
											>
												<Trash2 className="size-3.5" />
											</Button>
										</DialogAction>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => handleOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
