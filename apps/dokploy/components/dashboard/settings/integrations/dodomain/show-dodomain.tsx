import {
	AlertTriangle,
	CheckCircle2,
	ExternalLink,
	Loader2,
	Trash2,
	XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { LearnMoreLink } from "@/components/shared/learn-more-link";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { INTEGRATION_LEARN_MORE_URLS } from "../integration-links";
import {
	DODOMAIN_SITE_URL,
	DoDomainMark,
	PoweredByDoDomain,
} from "./dodomain-logo";
import { HandleDoDomain } from "./handle-dodomain";

/** DoDomain card on Settings → Integrations. */
export const ShowDoDomain = () => {
	const utils = api.useUtils();
	const { data: integration, isPending } = api.dodomain.one.useQuery();
	const { mutateAsync: remove, isPending: isRemoving } =
		api.dodomain.remove.useMutation();

	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-background p-4">
			<div className="flex flex-row items-start justify-between gap-4">
				<div className="flex flex-row gap-3">
					<DoDomainMark className="size-10 shrink-0" />
					<div className="flex flex-col gap-1">
						<span className="text-base font-medium">DoDomain</span>
						<span className="text-sm text-muted-foreground">
							Let the owners of custom domains connect them through a hosted
							flow (Cloudflare OAuth, Domain Connect or guided manual DNS).
							Dokploy verifies the DNS and applies the domain automatically.
						</span>
					</div>
				</div>
				{integration && (
					<div className="flex flex-row gap-1">
						<HandleDoDomain editing />
						<DialogAction
							title="Disconnect DoDomain"
							description="The stored secret key is removed and the webhook endpoint is deleted from DoDomain. Domains keep their current verification state, and connections already made stay in DoDomain."
							type="destructive"
							onClick={async () => {
								await remove()
									.then(async () => {
										toast.success("DoDomain disconnected");
										await utils.dodomain.one.invalidate();
										await utils.dodomain.configured.invalidate();
										await utils.dodomain.connectionStatus.invalidate();
									})
									.catch((e) => {
										toast.error("Error disconnecting DoDomain", {
											description: e.message,
										});
									});
							}}
						>
							<Button
								variant="ghost"
								size="icon"
								className="group hover:bg-red-500/10"
								isLoading={isRemoving}
								aria-label="Disconnect DoDomain"
							>
								<Trash2 className="size-4 text-primary group-hover:text-red-500" />
							</Button>
						</DialogAction>
					</div>
				)}
			</div>

			{isPending ? (
				<div className="flex flex-row items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					<span>Loading...</span>
				</div>
			) : integration ? (
				<dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg bg-sidebar p-3 text-sm sm:grid-cols-2">
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">Name</dt>
						<dd>{integration.name}</dd>
					</div>
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">Secret key</dt>
						<dd className="font-mono">{integration.secretKeyMasked}</dd>
					</div>
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">App ID</dt>
						<dd className="font-mono break-all">{integration.appId}</dd>
					</div>
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">Base URL</dt>
						<dd className="break-all">
							<a
								href={integration.baseUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 hover:underline"
							>
								{integration.baseUrl}
								<ExternalLink className="size-3" />
							</a>
						</dd>
					</div>
					<div className="flex flex-col sm:col-span-2">
						<dt className="text-xs text-muted-foreground">Webhook</dt>
						<dd className="flex items-center gap-1 break-all">
							{!integration.webhookRegistered ? (
								<>
									<XCircle
										className="size-3.5 shrink-0 text-red-500"
										aria-hidden="true"
									/>
									<span className="sr-only">Not registered</span>
								</>
							) : integration.webhookReachability.likelyPrivate ? (
								<>
									<AlertTriangle
										className="size-3.5 shrink-0 text-yellow-600"
										aria-hidden="true"
									/>
									<span className="sr-only">
										Registered, but DoDomain can&apos;t reach this address
									</span>
								</>
							) : (
								<>
									<CheckCircle2
										className="size-3.5 shrink-0 text-green-600"
										aria-hidden="true"
									/>
									<span className="sr-only">Registered</span>
								</>
							)}
							<span className="font-mono text-xs">
								{integration.webhookUrl || "Not registered"}
							</span>
						</dd>
					</div>
				</dl>
			) : (
				<div className="flex flex-col items-start gap-3 rounded-lg bg-sidebar p-3">
					<span className="text-sm text-muted-foreground">
						Not connected. You need a{" "}
						<a
							href={DODOMAIN_SITE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							DoDomain
						</a>{" "}
						app and its secret key, and this panel must be reachable over https.
					</span>
					<HandleDoDomain />
				</div>
			)}

			{integration?.webhookReachability.warning ? (
				<AlertBlock type="warning" className="w-full">
					{integration.webhookReachability.warning}
				</AlertBlock>
			) : (
				integration &&
				!integration.webhookRegistered && (
					<AlertBlock type="warning" className="w-full">
						DoDomain did not accept this panel&apos;s webhook URL, so
						domain-status webhooks won&apos;t arrive. DNS status still updates
						when you press Re-verify DNS. Save the integration again once the
						panel is served on a public HTTPS URL.
					</AlertBlock>
				)
			)}

			<div className="flex flex-row items-center justify-between gap-2">
				<LearnMoreLink href={INTEGRATION_LEARN_MORE_URLS.dodomain} />
				<PoweredByDoDomain />
			</div>
		</div>
	);
};
