import { useTranslation } from "react-i18next";
import { AlertBlock } from "@/components/shared/alert-block";

/**
 * Domains attached to a compose service are rendered as docker labels and only
 * take effect on the next deployment. These keys keep the "redeploy required"
 * wording consistent across the add/edit dialog, the domains list and the
 * toasts shown after create/update/delete/toggle operations.
 */
export const COMPOSE_REDEPLOY_HINT = "application.domains.composeRedeployHint";

export const COMPOSE_REDEPLOY_TOAST =
	"application.domains.composeRedeployToast";

export const ComposeRedeployAlert = ({ className }: { className?: string }) => {
	const { t } = useTranslation();
	return (
		<AlertBlock type="info" className={className}>
			{t(COMPOSE_REDEPLOY_HINT)}
		</AlertBlock>
	);
};
