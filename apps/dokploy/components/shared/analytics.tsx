import { OpenPanelComponent } from "@openpanel/nextjs";
import { useRouter } from "next/router";
import Script from "next/script";
import posthog from "posthog-js";
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
			<PostHogTracking />
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

const PostHogTracking = () => {
	const router = useRouter();
	const { data: config } = api.settings.getPostHogConfig.useQuery();
	const isDashboard = router.pathname.startsWith("/dashboard");
	const { data: member } = api.user.get.useQuery(undefined, {
		enabled: !!config && isDashboard,
	});
	const { data: billingStatus } = api.stripe.getBillingStatus.useQuery(
		undefined,
		{ enabled: !!config && isDashboard },
	);

	useEffect(() => {
		if (!config || posthog.__loaded) {
			return;
		}
		posthog.init(config.key, {
			api_host: config.host,
			defaults: "2025-05-24",
			person_profiles: "identified_only",
			tracing_headers: [window.location.hostname],
			// Replay only runs for trial / no-plan users, started below once billing status is known.
			disable_session_recording: true,
			session_recording: {
				maskAllInputs: true,
				// Editors, terminals and log viewers render env vars, compose files and secrets as plain text.
				maskTextSelector: ".cm-editor, .xterm, pre, code",
			},
		});
	}, [config]);

	const userId = member?.user.id;
	const email = member?.user.email;
	const organizationId = member?.organizationId;
	useEffect(() => {
		if (!config || !userId || !organizationId) {
			return;
		}
		posthog.identify(userId, { email });
		posthog.group("organization", organizationId);
	}, [config, userId, email, organizationId]);

	const utils = api.useUtils();
	useEffect(() => {
		// Outside the dashboard (login, register) the next user may be someone else; drop the
		// cached billing status so their recording decision never uses the previous user's plan.
		if (!isDashboard) {
			void utils.stripe.getBillingStatus.reset();
		}
	}, [isDashboard, utils]);

	const shouldRecord =
		isDashboard &&
		!!billingStatus &&
		!billingStatus.isEnterpriseCloud &&
		(billingStatus.isOnTrial || !billingStatus.hasActiveAccess);
	useEffect(() => {
		if (!config || !posthog.__loaded) {
			return;
		}
		if (shouldRecord) {
			posthog.startSessionRecording();
		} else {
			posthog.stopSessionRecording();
		}
	}, [config, shouldRecord]);

	return null;
};

export const resetPostHog = () => {
	if (posthog.__loaded) {
		posthog.stopSessionRecording();
		posthog.reset();
	}
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
		return () => {
			window.hsConversationsOnReady = window.hsConversationsOnReady?.filter(
				(callback) => callback !== loadWidget,
			);
			window.HubSpotConversations?.widget.remove();
		};
	}, [enabled]);
};
