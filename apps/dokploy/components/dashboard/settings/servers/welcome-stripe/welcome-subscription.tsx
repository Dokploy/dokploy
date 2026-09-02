import { defineStepper } from "@stepperize/react";
import {
	CheckIcon,
	DatabaseIcon,
	GitMergeIcon,
	GlobeIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Fragment, useEffect, useState } from "react";
import ConfettiExplosion from "react-confetti-explosion";
import { DeployStep } from "@/components/dashboard/onboarding/steps/deploy-step";
import { ProjectStep } from "@/components/dashboard/onboarding/steps/project-step";
import { ServerStep } from "@/components/dashboard/onboarding/steps/server-step";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const { useStepper, steps, Scoped } = defineStepper(
	{ id: "welcome", title: "Welcome" },
	{ id: "project", title: "New project" },
	{ id: "server", title: "Connect server" },
	{ id: "deploy", title: "Ship something" },
	{ id: "complete", title: "You're live" },
);

const features = [
	{
		icon: DatabaseIcon,
		title: "Databases",
		description: "Postgres, MySQL, MongoDB, Redis and more, one click away.",
	},
	{
		icon: GlobeIcon,
		title: "Custom domains",
		description: "Attach your own domains and get automatic HTTPS.",
	},
	{
		icon: GitMergeIcon,
		title: "CI/CD",
		description: "Auto-deploy on every push from GitHub, GitLab or Bitbucket.",
	},
	{
		icon: UsersIcon,
		title: "Team collaboration",
		description: "Invite teammates with fine-grained permissions.",
	},
];

const WelcomeIntro = ({ onNext }: { onNext: () => void }) => (
	<div className="flex flex-col gap-8">
		<div className="flex flex-col gap-3">
			<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
				Welcome
			</span>
			<h1 className="text-xl font-semibold tracking-tight">
				Welcome to Dokploy Cloud
			</h1>
			<p className="text-muted-foreground leading-relaxed">
				Thanks for subscribing — you're all set up. Next, connect a server so
				you can start deploying.
			</p>
		</div>
		<Button size="lg" onClick={onNext} className="w-fit px-8">
			Get started
		</Button>
	</div>
);

const CompleteIntro = ({ onFinish }: { onFinish: () => void }) => {
	const [showConfetti, setShowConfetti] = useState(false);
	useEffect(() => {
		setShowConfetti(true);
	}, []);

	return (
		<div className="flex flex-col gap-8">
			<div className="fixed inset-x-0 top-0 flex justify-center pointer-events-none">
				{showConfetti && (
					<ConfettiExplosion
						duration={3000}
						force={0.35}
						particleCount={200}
						width={1200}
						zIndex={60}
					/>
				)}
			</div>

			<div className="flex flex-col gap-3">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					Done
				</span>
				<h1 className="text-xl font-semibold tracking-tight">
					You're all set.
				</h1>
				<p className="text-muted-foreground leading-relaxed">
					Your server is connected — here's some of what you can do next.
				</p>
			</div>

			<dl className="flex flex-col divide-y">
				{features.map((feature, index) => (
					<div key={feature.title} className="flex gap-6 py-4 first:pt-0">
						<dt className="font-mono text-xs text-muted-foreground pt-1 shrink-0 w-6">
							{String(index + 1).padStart(2, "0")}
						</dt>
						<dd className="flex flex-col gap-1">
							<span className="font-medium flex items-center gap-2">
								<feature.icon className="size-4 text-muted-foreground" />
								{feature.title}
							</span>
							<span className="text-sm text-muted-foreground">
								{feature.description}
							</span>
						</dd>
					</div>
				))}
			</dl>

			<div className="flex items-center gap-4">
				<Button size="lg" className="w-fit px-8" onClick={onFinish}>
					Go to dashboard
				</Button>
				<Link
					href="https://discord.com/invite/2tBnJ3jDJc"
					target="_blank"
					className="text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					Need help? Join our Discord →
				</Link>
			</div>
		</div>
	);
};

export const WelcomeSubscription = () => {
	const router = useRouter();
	const stepper = useStepper();
	const [isOpen, setIsOpen] = useState(true);

	// This flow can also fire for an existing customer upgrading their plan
	// (any checkout success redirects here), not just a first-time
	// subscriber — so "New project" only belongs in the flow when they don't
	// already have one. Mirrors the isCloud-based step filtering in the main
	// onboarding wizard.
	const { data: projects } = api.project.all.useQuery();
	const hasExistingProject = (projects?.length ?? 0) > 0;
	const visibleStepIds = hasExistingProject
		? steps.filter((step) => step.id !== "project").map((step) => step.id)
		: steps.map((step) => step.id);
	const visibleIndex = visibleStepIds.indexOf(stepper.current.id);
	const isLast = visibleIndex === visibleStepIds.length - 1;
	const goToNextVisible = () => {
		const nextId = visibleStepIds[visibleIndex + 1];
		if (nextId) stepper.goTo(nextId);
	};

	const [projectId, setProjectId] = useState<string | undefined>();
	const [environmentId, setEnvironmentId] = useState<string | undefined>();

	const firstExistingProjectId = projects?.[0]?.projectId;
	const { data: existingEnvironments } = api.environment.byProjectId.useQuery(
		{ projectId: firstExistingProjectId ?? "" },
		{ enabled: !!firstExistingProjectId && !environmentId },
	);
	const resolvedEnvironmentId =
		environmentId ?? existingEnvironments?.[0]?.environmentId;

	const close = (destination: string) => {
		setIsOpen(false);
		router.push(destination);
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) close("/dashboard/settings/servers");
			}}
		>
			<DialogContent className="sm:max-w-2xl">
				<Scoped>
					<nav aria-label="Steps" className="flex items-center gap-2 pt-2">
						{visibleStepIds.map((id, index) => {
							const isDone = index < visibleIndex;
							const isCurrent = stepper.current.id === id;
							return (
								<Fragment key={id}>
									<button
										type="button"
										disabled={!isDone}
										onClick={() => stepper.goTo(id)}
										aria-current={isCurrent ? "step" : undefined}
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] transition-colors",
											isCurrent
												? "border-2 border-primary text-primary font-semibold"
												: isDone
													? "bg-primary text-primary-foreground cursor-pointer"
													: "border border-border text-muted-foreground",
										)}
									>
										{isDone ? <CheckIcon className="size-3.5" /> : index + 1}
									</button>
									{index < visibleStepIds.length - 1 && (
										<span
											className={cn(
												"h-px flex-1",
												isDone ? "bg-primary" : "bg-border",
											)}
										/>
									)}
								</Fragment>
							);
						})}
					</nav>
				</Scoped>

				<div className="py-2">
					{stepper.switch({
						welcome: () => <WelcomeIntro onNext={goToNextVisible} />,
						project: () => (
							<ProjectStep
								plainTitle
								onNext={(project) => {
									setProjectId(project.projectId);
									setEnvironmentId(project.environmentId);
									goToNextVisible();
								}}
							/>
						),
						server: () => <ServerStep plainTitle onNext={goToNextVisible} />,
						deploy: () => (
							<DeployStep
								plainTitle
								environmentId={resolvedEnvironmentId}
								onNext={goToNextVisible}
							/>
						),
						complete: () => (
							<CompleteIntro onFinish={() => close("/dashboard/home")} />
						),
					})}
				</div>

				{!isLast && (
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => close("/dashboard/settings/servers")}
						>
							Skip for now
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
};
