import { GitBranchIcon, PuzzleIcon, ServerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayFont } from "../font";

interface Props {
	onNext: () => void;
}

const points = [
	{
		icon: GitBranchIcon,
		title: "Deploy from Git or Docker",
		description:
			"Push a repo, a compose file, or a container image and go live.",
	},
	{
		icon: PuzzleIcon,
		title: "One-click templates",
		description:
			"WordPress, databases, and dozens of open source apps, pre-wired.",
	},
	{
		icon: ServerIcon,
		title: "Your own servers",
		description: "Runs on infrastructure you control — no vendor lock-in.",
	},
];

export const WelcomeStep = ({ onNext }: Props) => {
	return (
		<div className="flex flex-col gap-12">
			<div className="flex flex-col gap-4">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					Welcome
				</span>
				<h1
					className={`${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`}
				>
					Let's get your first app <em className="not-italic">live</em>.
				</h1>
				<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
					A few steps — pick a plan, connect a server, ship something. You'll
					have a working URL by the end.
				</p>
			</div>

			<dl className="flex flex-col divide-y">
				{points.map((point, index) => (
					<div key={point.title} className="flex gap-6 py-5 first:pt-0">
						<dt className="font-mono text-xs text-muted-foreground pt-1 shrink-0 w-6">
							{String(index + 1).padStart(2, "0")}
						</dt>
						<dd className="flex flex-col gap-1">
							<span className="font-medium flex items-center gap-2">
								<point.icon className="size-4 text-muted-foreground" />
								{point.title}
							</span>
							<span className="text-sm text-muted-foreground">
								{point.description}
							</span>
						</dd>
					</div>
				))}
			</dl>

			<Button size="lg" onClick={onNext} className="w-fit px-8">
				Get started
			</Button>
		</div>
	);
};
