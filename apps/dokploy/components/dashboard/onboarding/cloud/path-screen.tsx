import { ScreenHeading } from "./screen-heading";
import { ServerPathCards } from "./server-path-cards";

interface Props {
	onHaveServer: () => void;
	onNeedServer: () => void;
}

export const PathScreen = ({ onHaveServer, onNeedServer }: Props) => (
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
		<p className="max-w-lg text-sm text-muted-foreground">
			Not ready? Use “Look around first” to explore the dashboard. This choice
			stays on its home page, nothing can be deployed until a server is
			connected, and your trial won't start until then.
		</p>
	</section>
);
