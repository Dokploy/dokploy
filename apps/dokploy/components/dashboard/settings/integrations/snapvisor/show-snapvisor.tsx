import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { snapvisorWebBaseUrl } from "@dokploy/server/utils/snapvisor/urls";
import { HandleSnapvisor } from "./handle-snapvisor";
import {
	PoweredBySnapvisor,
	SNAPVISOR_SITE_URL,
	SnapvisorMark,
} from "./snapvisor-logo";

/** Snapvisor card on Settings → Integrations. */
export const ShowSnapvisor = () => {
	const utils = api.useUtils();
	const { data: integration, isPending } = api.snapvisor.one.useQuery();
	const { mutateAsync: remove, isPending: isRemoving } =
		api.snapvisor.remove.useMutation();

	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-background p-4">
			<div className="flex flex-row items-start justify-between gap-4">
				<div className="flex flex-row gap-3">
					<SnapvisorMark className="size-10 shrink-0" />
					<div className="flex flex-col gap-1">
						<span className="text-base font-medium">Snapvisor</span>
						<span className="text-sm text-muted-foreground">
							Visual-diff status for preview deployments, registered from each
							application&apos;s Preview Deployment settings.
						</span>
					</div>
				</div>
				{integration && (
					<div className="flex flex-row gap-1">
						<HandleSnapvisor editing />
						<DialogAction
							title="Disconnect Snapvisor"
							description="The stored access token and every application's project link are removed from Dokploy. Builds already created in Snapvisor by your CI are unaffected."
							type="destructive"
							onClick={async () => {
								await remove()
									.then(async () => {
										toast.success("Snapvisor disconnected");
										await utils.snapvisor.one.invalidate();
										await utils.snapvisor.previewBuild.invalidate();
									})
									.catch((e) => {
										toast.error("Error disconnecting Snapvisor", {
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
								aria-label="Disconnect Snapvisor"
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
						<dt className="text-xs text-muted-foreground">Access token</dt>
						<dd className="font-mono">{integration.accessTokenMasked}</dd>
					</div>
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">Account slug</dt>
						<dd className="font-mono break-all">{integration.accountSlug}</dd>
					</div>
					<div className="flex flex-col">
						<dt className="text-xs text-muted-foreground">Base URL</dt>
						<dd className="break-all">
							<a
								href={`${snapvisorWebBaseUrl(integration.baseUrl)}/${integration.accountSlug}`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 hover:underline"
							>
								{integration.baseUrl}
								<ExternalLink className="size-3" />
							</a>
						</dd>
					</div>
				</dl>
			) : (
				<div className="flex flex-col items-start gap-3 rounded-lg bg-sidebar p-3">
					<span className="text-sm text-muted-foreground">
						Not connected. You need a{" "}
						<a
							href={SNAPVISOR_SITE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							Snapvisor
						</a>{" "}
						account and a personal access token.
					</span>
					<HandleSnapvisor />
				</div>
			)}

			<PoweredBySnapvisor />
		</div>
	);
};
