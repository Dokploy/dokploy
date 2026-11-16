import { api } from "@/utils/api";
import { ServerPathCards } from "./server-path-cards";

interface Props {
	onStart: (screen: "connect" | "provider") => void;
}

export const ConnectServerPrompt = ({ onStart }: Props) => {
	const { data: billing } = api.stripe.getBillingStatus.useQuery();
	const trialNote = billing?.hasUsedTrial
		? ""
		: " Your 7-day trial starts when it connects, not before.";

	return (
		<section className="flex flex-col gap-6 rounded-2xl border bg-background p-6 lg:p-8">
			<div className="flex flex-col gap-2">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					Next step
				</span>
				<h2 className="text-2xl font-semibold tracking-tight">
					Connect a server to start deploying
				</h2>
				<p className="max-w-xl text-muted-foreground">
					Dokploy runs your apps on a server you own.{trialNote}
				</p>
			</div>
			<ServerPathCards
				compact
				onHaveServer={() => onStart("connect")}
				onNeedServer={() => onStart("provider")}
			/>
		</section>
	);
};
