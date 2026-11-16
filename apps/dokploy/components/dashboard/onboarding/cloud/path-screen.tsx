import { Button } from "@/components/ui/button";
import { ScreenHeading } from "./screen-heading";
import { ServerPathCards } from "./server-path-cards";

interface Props {
	onHaveServer: () => void;
	onNeedServer: () => void;
	onSkip: () => void;
	onPayNow: () => void;
	canStartTrial: boolean;
}

export const PathScreen = ({
	onHaveServer,
	onNeedServer,
	onSkip,
	onPayNow,
	canStartTrial,
}: Props) => (
	<section className="flex flex-col gap-10">
		<ScreenHeading
			eyebrow="Infrastructure"
			title={
				<>
					Where should Dokploy deploy <em className="not-italic">your apps</em>?
				</>
			}
		>
			Dokploy runs your apps on a server you own. Pick what fits you.
		</ScreenHeading>
		<ServerPathCards onHaveServer={onHaveServer} onNeedServer={onNeedServer} />
		<div className="flex flex-col gap-6 border-t pt-6">
			<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
				<Button variant="outline" className="shrink-0" onClick={onSkip}>
					Look around first
				</Button>
				<p className="text-sm text-muted-foreground">
					You can explore the dashboard. Nothing can be deployed until a server
					is connected
					{canStartTrial ? ", and your trial won't start until then." : "."}
				</p>
			</div>
			{canStartTrial && (
				<p className="text-sm text-muted-foreground">
					Already decided?{" "}
					<button
						type="button"
						onClick={onPayNow}
						className="font-medium text-foreground underline underline-offset-4"
					>
						Pay now and skip the trial
					</button>
				</p>
			)}
		</div>
	</section>
);
