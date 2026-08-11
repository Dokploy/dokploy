import { createFileRoute } from "@tanstack/react-router";
import { EnterpriseFeatureGate } from "@/components/proprietary/enterprise-feature-gate";
import { WhitelabelingSettings } from "@/components/proprietary/whitelabeling/whitelabeling-settings";
import { Card } from "@/components/ui/card";

const Page = () => {
	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<div className="p-6">
							<EnterpriseFeatureGate
								lockedProps={{
									title: "Enterprise Whitelabeling",
									description:
										"Whitelabeling allows you to fully customize logos, colors, CSS, error pages, and more. Add a valid license to configure it.",
									ctaLabel: "Go to License",
								}}
							>
								<WhitelabelingSettings />
							</EnterpriseFeatureGate>
						</div>
					</div>
				</Card>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/whitelabeling")({
	component: Page,
});
