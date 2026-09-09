import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { api } from "@/utils/api";
import { useWhitelabeling } from "@/utils/hooks/use-whitelabeling";
import { ImpersonationBar } from "../dashboard/impersonation/impersonation-bar";
import { HubSpotWidget } from "../shared/HubSpotWidget";
import Page from "./side";

interface Props {
	children: React.ReactNode;
	metaName?: string;
}

export const DashboardLayout = ({ children, metaName }: Props) => {
	const router = useRouter();
	const { data: haveRootAccess } = api.user.haveRootAccess.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { config: whitelabeling } = useWhitelabeling();
	const appName = whitelabeling?.appName || "Dokploy";
	const { data: currentPlan } = api.stripe.getCurrentPlan.useQuery(undefined, {
		enabled: isCloud === true,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		refetchOnReconnect: false,
	});

	const isChatEnabled = isCloud === true && currentPlan === "startup";

	const { data: onboardingStatus } = api.project.onboardingStatus.useQuery();
	const shouldRedirectToOnboarding =
		router.pathname !== "/dashboard/home" &&
		onboardingStatus?.shouldShowOnboarding === true;

	useEffect(() => {
		if (shouldRedirectToOnboarding) {
			router.replace("/dashboard/home");
		}
	}, [shouldRedirectToOnboarding, router]);

	if (shouldRedirectToOnboarding) {
		return null;
	}

	return (
		<>
			{metaName && (
				<Head>
					<title>
						{metaName} | {appName}
					</title>
				</Head>
			)}
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
