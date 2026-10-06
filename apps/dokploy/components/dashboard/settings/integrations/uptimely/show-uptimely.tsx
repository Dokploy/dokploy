import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { LearnMoreLink } from "@/components/shared/learn-more-link";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { INTEGRATION_LEARN_MORE_URLS } from "../integration-links";
import { HandleUptimely } from "./handle-uptimely";
import {
	PoweredByUptimely,
	UPTIMELY_SITE_URL,
	UptimelyMark,
} from "./uptimely-logo";

/** Uptimely card on Settings → Integrations. */
export const ShowUptimely = () => {
	const utils = api.useUtils();
	const { data: integration, isPending } = api.uptimely.one.useQuery();
	const { mutateAsync: remove, isPending: isRemoving } =
		api.uptimely.remove.useMutation();

	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-background p-4">
			<div className="flex flex-row items-start justify-between gap-4">
				<div className="flex flex-row gap-3">
					<UptimelyMark className="size-10 shrink-0" />
					<div className="flex flex-col gap-1">
						<span className="text-base font-medium">Uptimely</span>
						<span className="text-sm text-muted-foreground">
							Uptime, SSL certificate and domain monitors for your services,
							created from each service&apos;s Monitoring tab.
						</span>
					</div>
				</div>
				{integration && (
					<div className="flex flex-row gap-1">
						<HandleUptimely editing />
						<DialogAction
							title="Disconnect Uptimely"
							description="The stored API key and every service link are removed from Dokploy. Monitors already created stay in Uptimely until you delete them there."
							type="destructive"
							onClick={async () => {
								await remove()
									.then(async () => {
										toast.success("Uptimely disconnected");
										await utils.uptimely.one.invalidate();
										await utils.uptimely.serviceStatus.invalidate();
									})
									.catch((e) => {
										toast.error("Error disconnecting Uptimely", {
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
								aria-label="Disconnect Uptimely"
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
						<dt className="text-xs text-muted-foreground">API key</dt>
						<dd className="font-mono">{integration.apiKeyMasked}</dd>
					</div>
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">Project ID</dt>
						<dd className="font-mono break-all">{integration.projectId}</dd>
					</div>
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">Base URL</dt>
						<dd className="break-all">
							<a
								href={`${integration.baseUrl}/dashboard/${integration.projectId}/monitors`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 hover:underline"
							>
								{integration.baseUrl}
								<ExternalLink className="size-3" />
							</a>
						</dd>
					</div>
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">Status page</dt>
						<dd>{integration.statusPageSlug || "Not set"}</dd>
					</div>
				</dl>
			) : (
				<div className="flex flex-col items-start gap-3 rounded-lg bg-sidebar p-3">
					<span className="text-sm text-muted-foreground">
						Not connected. You need an{" "}
						<a
							href={UPTIMELY_SITE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							Uptimely
						</a>{" "}
						project and one of its API keys.
					</span>
					<HandleUptimely />
				</div>
			)}

			<div className="flex flex-row items-center justify-between gap-2">
				<LearnMoreLink href={INTEGRATION_LEARN_MORE_URLS.uptimely} />
				<PoweredByUptimely />
			</div>
		</div>
	);
};
