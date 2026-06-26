"use client";

import { ToggleEnforceSSO } from "@/components/dashboard/settings/servers/actions/toggle-enforce-sso";
import { ToggleHideHelpLinks } from "@/components/dashboard/settings/servers/actions/toggle-hide-help-links";
import { ToggleHideSocialLinks } from "@/components/dashboard/settings/servers/actions/toggle-hide-social-links";
import { ToggleHideSSOLogin } from "@/components/dashboard/settings/servers/actions/toggle-hide-sso-login";
import { ToggleRemoteServersOnly } from "@/components/dashboard/settings/servers/actions/toggle-remote-servers-only";
import { ToggleShowSSO } from "@/components/dashboard/settings/servers/actions/toggle-show-sso";
import { ToggleShowWhitelabeling } from "@/components/dashboard/settings/servers/actions/toggle-show-whitelabeling";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";

/**
 * Enterprise feature controls shown on the License page once a valid license is
 * active. Self-hosted only (these settings don't apply to Dokploy Cloud).
 */
export function LicenseFeatureSettings() {
	const { data: haveValidLicense } =
		api.licenseKey.haveValidLicenseKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	// Only relevant for self-hosted instances with an active license.
	if (isCloud || !haveValidLicense) {
		return null;
	}

	return (
		<>
			<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl">Features</CardTitle>
						<CardDescription>
							Enable or disable enterprise features and control whether they
							appear in the sidebar.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<ToggleShowSSO />
						<ToggleShowWhitelabeling />
					</CardContent>
				</div>
			</Card>

			<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl">Self-hosted Restrictions</CardTitle>
						<CardDescription>
							Control deployment targets and authentication behavior.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<ToggleRemoteServersOnly />
						<ToggleEnforceSSO />
						<ToggleHideHelpLinks />
						<ToggleHideSocialLinks />
						<ToggleHideSSOLogin />
					</CardContent>
				</div>
			</Card>
		</>
	);
}
