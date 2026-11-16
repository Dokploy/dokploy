import { ServerCogIcon, ServerIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
	onHaveServer: () => void;
	onNeedServer: () => void;
}

const OPTIONS = [
	{
		id: "have",
		icon: ServerIcon,
		title: "I have a server",
		description: "Connect it with one command. About 2 minutes.",
		action: "Connect my server",
	},
	{
		id: "need",
		icon: ServerCogIcon,
		title: "I need a server",
		description:
			"Get one from Hostinger, Hetzner, Contabo, DigitalOcean or any other provider. About 5 minutes.",
		action: "Help me get one",
	},
] as const;

export const ServerPathCards = ({ onHaveServer, onNeedServer }: Props) => (
	<div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border">
		{OPTIONS.map((option) => (
			<button
				key={option.id}
				type="button"
				onClick={option.id === "have" ? onHaveServer : onNeedServer}
				className={cn(
					"group flex flex-col items-start justify-between bg-background text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/60",
					"gap-10 p-7",
				)}
			>
				<div className="flex flex-col gap-3">
					<span className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
						<option.icon className="size-5" aria-hidden />
					</span>
					<div>
						<p className="font-medium">{option.title}</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{option.description}
						</p>
					</div>
				</div>
				<span className="font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
					{option.action} →
				</span>
			</button>
		))}
	</div>
);
