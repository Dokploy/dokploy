import { createFileRoute } from "@tanstack/react-router";
import { LicenseKeySettings } from "@/components/proprietary/license-keys/license-key";
import { Card } from "@/components/ui/card";

const Page = () => {
	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<div className="p-6">
							<LicenseKeySettings />
						</div>
					</div>
				</Card>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/license")({
	component: Page,
});
