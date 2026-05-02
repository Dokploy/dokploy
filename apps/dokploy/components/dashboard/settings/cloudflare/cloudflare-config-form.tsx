import { Check, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

const REQUIRED_PERMISSIONS = [
	"Account → Cloudflare Tunnel → Edit",
	"Zone → DNS → Edit",
	"Zone → Zone → Read",
	"Account → Account Settings → Read",
];

export const CloudflareConfigForm = () => {
	const utils = api.useUtils();
	const { data, isLoading } = api.cloudflare.getConfig.useQuery();
	const [token, setToken] = useState("");
	const [verifyResult, setVerifyResult] = useState<{
		ok: boolean;
		accountId: string | null;
		scopes: string[];
		status: string;
	} | null>(null);

	const verifyMut = api.cloudflare.verifyToken.useMutation({
		onSuccess: (r) => setVerifyResult(r),
		onError: (e) => {
			setVerifyResult(null);
			toast.error(e.message);
		},
	});
	const saveMut = api.cloudflare.saveToken.useMutation({
		onSuccess: () => {
			toast.success("Cloudflare token saved");
			setToken("");
			setVerifyResult(null);
			utils.cloudflare.getConfig.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});
	const deleteMut = api.cloudflare.deleteConfig.useMutation({
		onSuccess: () => {
			toast.success("Cloudflare config removed");
			utils.cloudflare.getConfig.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});

	const hasConfig = !!data?.config;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Cloudflare</CardTitle>
				<CardDescription>
					Configure a Cloudflare API token to enable auto-managed tunnels and
					DNS routing for your servers.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoading ? (
					<div className="flex items-center gap-2 text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading...
					</div>
				) : hasConfig ? (
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<Badge variant="secondary">Configured</Badge>
							<span className="text-sm text-muted-foreground">
								Account ID:{" "}
								<code className="font-mono">{data.config?.accountId}</code>
							</span>
						</div>
						{data.config?.verifiedAt && (
							<p className="text-xs text-muted-foreground">
								Verified at {new Date(data.config.verifiedAt).toLocaleString()}
							</p>
						)}
						<div className="flex gap-2">
							<DialogAction
								title="Remove Cloudflare config?"
								description="This deletes the org token and any zones configured here. Existing CF-managed domains will keep their record IDs but will no longer reconcile."
								onClick={() => deleteMut.mutate()}
							>
								<Button
									variant="destructive"
									size="sm"
									disabled={deleteMut.isPending}
								>
									<Trash2 className="h-4 w-4" />
									Remove Config
								</Button>
							</DialogAction>
						</div>
					</div>
				) : null}

				<div className="flex flex-col gap-2">
					<Label htmlFor="cf-token">API Token</Label>
					<Input
						id="cf-token"
						type="password"
						placeholder="Paste your Cloudflare API token"
						value={token}
						onChange={(e) => {
							setToken(e.target.value);
							setVerifyResult(null);
						}}
					/>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						onClick={() => verifyMut.mutate({ apiToken: token })}
						disabled={!token || verifyMut.isPending}
					>
						{verifyMut.isPending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : null}
						Verify
					</Button>
					<Button
						onClick={() => saveMut.mutate({ apiToken: token })}
						disabled={!token || saveMut.isPending}
					>
						{saveMut.isPending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : null}
						Save Token
					</Button>
				</div>
				{verifyResult ? (
					verifyResult.ok ? (
						<div className="flex items-center gap-2 text-sm text-green-600">
							<Check className="h-4 w-4" /> Token valid · account{" "}
							<code className="font-mono">{verifyResult.accountId}</code>
						</div>
					) : (
						<AlertBlock type="error">
							Token verification failed (status: {verifyResult.status}).
						</AlertBlock>
					)
				) : null}
				<div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
					<p className="mb-1 font-medium">Required token permissions:</p>
					<ul className="list-disc pl-4">
						{REQUIRED_PERMISSIONS.map((p) => (
							<li key={p}>{p}</li>
						))}
					</ul>
				</div>
			</CardContent>
		</Card>
	);
};
