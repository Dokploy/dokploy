import { AlertBlock } from "@/components/shared/alert-block";

/**
 * Domains attached to a compose service are rendered as docker labels and only
 * take effect on the next deployment. These strings keep the "redeploy required"
 * wording consistent across the add/edit dialog, the domains list and the
 * toasts shown after create/update/delete/toggle operations.
 */
export const COMPOSE_REDEPLOY_HINT =
	"Whenever you make changes to domains, remember to redeploy your compose to apply the changes.";

export const COMPOSE_REDEPLOY_TOAST =
	"Redeploy the compose to apply the changes.";

export const ComposeRedeployAlert = ({ className }: { className?: string }) => (
	<AlertBlock type="info" className={className}>
		{COMPOSE_REDEPLOY_HINT}
	</AlertBlock>
);
