import { Blocks } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ShowDoDomain } from "./dodomain/show-dodomain";
import { ShowSnapvisor } from "./snapvisor/show-snapvisor";
import { ShowUptimely } from "./uptimely/show-uptimely";

/**
 * Integration cards rendered on Settings → Integrations, in order. Each card
 * is self-contained (its own queries, dialogs and "Powered by" footer); add a
 * new product by appending its card component here.
 */
const INTEGRATION_CARDS: { id: string; Card: ComponentType }[] = [
	{ id: "uptimely", Card: ShowUptimely },
	{ id: "dodomain", Card: ShowDoDomain },
	{ id: "snapvisor", Card: ShowSnapvisor },
];

export const IntegrationsPage = () => {
	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<Blocks className="size-6 text-muted-foreground self-center" />
							Integrations
						</CardTitle>
						<CardDescription>
							Connect third-party products to your organization. Each
							integration is configured once here and then used from the
							relevant service pages.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4 py-8 border-t">
						{INTEGRATION_CARDS.map(({ id, Card: IntegrationCard }) => (
							<IntegrationCard key={id} />
						))}
						<p className="text-sm text-muted-foreground">
							Sendly and Notifly are set up as notification channels in{" "}
							<Link
								href="/dashboard/settings/notifications"
								className="underline"
							>
								Notifications
							</Link>
							.
						</p>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
