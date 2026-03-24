import { api } from "@/utils/api";
import { ImpersonationBar } from "../dashboard/impersonation/impersonation-bar";
import { HubSpotWidget } from "../shared/HubSpotWidget";
import {
	DashboardDocumentTitle,
	type DashboardPageTitleKey,
} from "./dashboard-document-title";
import Page from "./side";

interface Props {
	children: React.ReactNode;
	/** Localized browser tab title (merged with app name from `layout.defaultAppName`). */
	pageTitleKey?: DashboardPageTitleKey;
}

export const DashboardLayout = ({ children, pageTitleKey }: Props) => {
	const { data: haveRootAccess } = api.user.haveRootAccess.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: currentPlan } = api.stripe.getCurrentPlan.useQuery(undefined, {
		enabled: isCloud === true,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		refetchOnReconnect: false,
	});

	const isChatEnabled = isCloud === true && currentPlan === "startup";

	return (
		<>
			{pageTitleKey ? (
				<DashboardDocumentTitle pageTitleKey={pageTitleKey} />
			) : null}
			<Page>{children}</Page>
			{isChatEnabled && (
				<>
					<HubSpotWidget />
				</>
			)}

			{haveRootAccess === true && <ImpersonationBar />}
		</>
	);
};
