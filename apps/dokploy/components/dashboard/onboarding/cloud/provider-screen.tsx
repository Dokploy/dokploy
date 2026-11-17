import { ArrowUpRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERVER_PROVIDERS, SERVER_REQUIREMENTS } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { BackLink, ScreenHeading } from "./screen-heading";
import { trackOnboarding } from "./track";

const OTHER = "other";

const initials = (name: string) => {
	const capitals = name.match(/[A-Z]/g) ?? [];
	return capitals.length > 1 ? capitals.slice(0, 2).join("") : name.slice(0, 2);
};

const STEPS = [
	"Create a server with Ubuntu and at least 2 GB of RAM.",
	"Open the server's web console, or SSH in as root.",
	"Come back here to get the command that connects it.",
];

interface Props {
	provider: string;
	onProviderChange: (provider: string) => void;
	onBack: () => void;
	onContinue: () => void;
}

export const ProviderScreen = ({
	provider,
	onProviderChange,
	onBack,
	onContinue,
}: Props) => {
	const current = SERVER_PROVIDERS.find((item) => item.id === provider);
	const optionClassName = (selected: boolean) =>
		cn(
			"relative flex flex-col items-start gap-3 p-5 text-left transition-colors focus-visible:outline-none",
			selected ? "bg-muted" : "bg-background hover:bg-muted/40",
		);
	const dot = (selected: boolean) => (
		<span
			aria-hidden
			className={cn(
				"absolute right-4 top-4 flex size-4 items-center justify-center rounded-full border",
				selected ? "border-primary" : "border-muted-foreground/40",
			)}
		>
			{selected && <span className="size-2 rounded-full bg-primary" />}
		</span>
	);

	return (
		<section className="flex flex-col gap-10">
			<div className="flex flex-col gap-6">
				<BackLink onClick={onBack} />
				<ScreenHeading eyebrow="Get a server" title="Pick a provider.">
					Any VPS works. These four work well with Dokploy, or use your own.
					Create a server, then come back here to connect it.
				</ScreenHeading>
				<div className="flex flex-wrap gap-2">
					{SERVER_REQUIREMENTS.map((requirement) => (
						<span
							key={requirement}
							className="rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
						>
							{requirement}
						</span>
					))}
				</div>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border">
				{SERVER_PROVIDERS.map((item) => {
					const selected = provider === item.id;
					return (
						<button
							key={item.id}
							type="button"
							aria-pressed={selected}
							onClick={() => onProviderChange(item.id)}
							className={optionClassName(selected)}
						>
							{dot(selected)}
							<span
								aria-hidden
								className="flex size-10 items-center justify-center rounded-lg border bg-background font-mono text-xs font-semibold uppercase"
							>
								{initials(item.name)}
							</span>
							<span className="flex flex-col gap-1">
								<span className="font-medium">{item.name}</span>
								<span className="text-sm text-muted-foreground">
									{item.offer
										? `${item.offer} through Dokploy`
										: "Low-cost VPS plans"}
								</span>
							</span>
						</button>
					);
				})}
				<button
					type="button"
					aria-pressed={provider === OTHER}
					onClick={() => onProviderChange(OTHER)}
					className={cn(optionClassName(provider === OTHER), "sm:col-span-2")}
				>
					{dot(provider === OTHER)}
					<span className="flex flex-col gap-1">
						<span className="font-medium">Another provider</span>
						<span className="text-sm text-muted-foreground">
							Vultr, Linode, OVHcloud, AWS Lightsail, a home server or any VPS
							with root access.
						</span>
					</span>
				</button>
			</div>

			<div className="flex flex-col gap-6">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
					{current ? `On ${current.name}` : "On your provider"}
				</span>
				<dl className="flex flex-col divide-y">
					{STEPS.map((step, index) => (
						<div key={step} className="flex gap-6 py-4 first:pt-0">
							<dt className="w-6 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
								{String(index + 1).padStart(2, "0")}
							</dt>
							<dd className="text-sm">{step}</dd>
						</div>
					))}
				</dl>
				<div className="flex flex-wrap items-center gap-3">
					<Button size="lg" className="px-8" onClick={onContinue}>
						I have my server, continue
					</Button>
					{current && (
						<Button size="lg" variant="outline" asChild>
							<a
								href={current.url}
								target="_blank"
								rel="noreferrer"
								onClick={() =>
									trackOnboarding("provider_link_clicked", {
										provider: current.id,
									})
								}
							>
								Open {current.name}
								<ArrowUpRightIcon className="size-4" />
							</a>
						</Button>
					)}
				</div>
				<p className="text-sm text-muted-foreground">
					Your progress is saved. We'll email you a link back to this step
					within the hour.
				</p>
			</div>
		</section>
	);
};
