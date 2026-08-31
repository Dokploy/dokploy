import { OpenPanelComponent } from "@openpanel/nextjs";
import { useRouter } from "next/router";
import Script from "next/script";
import { useEffect } from "react";
import { GTM_ID, pushToDataLayer } from "@/lib/analytics";
import { api } from "@/utils/api";

/**
 * Loads Google Tag Manager, the HubSpot marketing tag, and OpenPanel
 * product analytics on the cloud version only, and translates tracking
 * query params appended by the auth/billing flows (?signup=...,
 * ?subscription=new) into dataLayer events.
 */
export const Analytics = () => {
	const router = useRouter();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	useEffect(() => {
		if (!isCloud || !router.isReady) {
			return;
		}
		const { signup, subscription, tier, ...rest } = router.query;

		if (typeof signup === "string" && signup.length > 0) {
			pushToDataLayer("sign_up", { method: signup });
		}
		if (subscription === "new") {
			pushToDataLayer("new_subscription", {
				...(typeof tier === "string" ? { tier } : {}),
			});
		}
		if (signup !== undefined || subscription !== undefined) {
			router.replace({ pathname: router.pathname, query: rest }, undefined, {
				shallow: true,
			});
		}
	}, [isCloud, router.isReady, router.query, router.pathname, router.replace]);

	if (!isCloud) {
		return null;
	}

	return (
		<>
			<OpenPanelComponent
				apiUrl="https://openpanel.dokploy.com/api"
				clientId="bf5a178b-7f28-4461-bf47-d63feff15922"
				trackScreenViews={true}
				trackOutgoingLinks={true}
				trackAttributes={true}
				globalProperties={{ site: "app" }}
			/>
			<Script id="analytics-init" strategy="afterInteractive">
				{`
					window.hsConversationsSettings = { loadImmediately: false };
					(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
					new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
					j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
					'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
					})(window,document,'script','dataLayer','${GTM_ID}');
				`}
			</Script>
			<Script
				id="hs-script-loader"
				type="text/javascript"
				src="//js-eu1.hs-scripts.com/147033433.js"
				strategy="lazyOnload"
				async
				defer
			/>
		</>
	);
};

/**
 * The HubSpot script is loaded app-wide for marketing tracking, but the
 * conversations (chat) widget stays restricted to startup plan customers.
 */
export const useHubSpotChat = (enabled: boolean) => {
	useEffect(() => {
		if (!enabled) {
			return;
		}
		const loadWidget = () => {
			window.HubSpotConversations?.widget.load();
		};
		if (window.HubSpotConversations) {
			loadWidget();
		} else {
			window.hsConversationsOnReady = [
				...(window.hsConversationsOnReady || []),
				loadWidget,
			];
		}
	}, [enabled]);
};
