import { defineStepper } from "@stepperize/react";
import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { GithubIcon } from "@/components/icons/data-tools-icons";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { getOnboardingState, setOnboardingState } from "./onboarding-lock";
import { CompleteStep } from "./steps/complete-step";
import { DeployStep } from "./steps/deploy-step";
import { PlanStep } from "./steps/plan-step";
import { ProjectStep } from "./steps/project-step";
import { ServerStep } from "./steps/server-step";
import { WelcomeStep } from "./steps/welcome-step";

const { useStepper, steps, Scoped } = defineStepper(
	{ id: "welcome", title: "Welcome" },
	{ id: "plan", title: "Pick a plan" },
	{ id: "project", title: "New project" },
	{ id: "server", title: "Connect server" },
	{ id: "deploy", title: "Ship something" },
	{ id: "complete", title: "You're live" },
);

type StepId = (typeof steps)[number]["id"];
const isStepId = (id: string | undefined): id is StepId =>
	!!id && steps.some((step) => step.id === id);

interface Props {
	onClose: () => void | Promise<void>;
}

export const OnboardingWizard = ({ onClose }: Props) => {
	const router = useRouter();
	const persisted = getOnboardingState();
	const stepper = useStepper(
		isStepId(persisted.stepId) ? persisted.stepId : undefined,
	);
	const [projectId, setProjectId] = useState<string | undefined>(
		persisted.projectId,
	);
	const [environmentId, setEnvironmentId] = useState<string | undefined>(
		persisted.environmentId,
	);

	const { data: isCloud = true } = api.settings.isCloud.useQuery();
	const visibleStepIds = isCloud
		? steps.map((step) => step.id)
		: steps
				.filter((step) => step.id !== "plan" && step.id !== "server")
				.map((step) => step.id);
	const visibleIndex = visibleStepIds.indexOf(stepper.current.id);
	const isLastVisible = visibleIndex === visibleStepIds.length - 1;
	const goToNextVisible = () => {
		const nextId = visibleStepIds[visibleIndex + 1];
		if (nextId) stepper.goTo(nextId);
	};

	const [skipAllOpen, setSkipAllOpen] = useState(false);
	const handleSkipAll = async () => {
		await onClose();
		router.push(
			projectId && environmentId
				? `/dashboard/project/${projectId}/environment/${environmentId}`
				: "/dashboard/projects",
		);
	};

	useEffect(() => {
		setOnboardingState({ stepId: stepper.current.id });
	}, [stepper.current.id]);

	const { error: projectCheckError } = api.project.one.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId, retry: false },
	);
	useEffect(() => {
		if (!projectCheckError || !projectId) return;
		setProjectId(undefined);
		setEnvironmentId(undefined);
		setOnboardingState({ projectId: undefined, environmentId: undefined });
		stepper.goTo("project");
	}, [projectCheckError, projectId]);

	return (
		<>
			<div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-background text-foreground">
				<aside className="relative shrink-0 md:w-[300px] lg:w-[340px] overflow-hidden bg-zinc-950 text-zinc-400">
					<div
						className="pointer-events-none absolute inset-0 opacity-[0.07]"
						style={{
							backgroundImage:
								"linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
							backgroundSize: "28px 28px",
						}}
					/>
					<div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-white/10 blur-[100px]" />

					<div className="relative flex md:h-full flex-col p-6 lg:p-8">
						<div className="flex items-center justify-between md:block">
							<div className="flex items-center gap-2.5 text-zinc-50 [&_path]:!fill-white [&_path]:!stroke-white">
								<Logo className="size-7" />
								<span className="text-lg font-semibold tracking-tight">
									Dokploy
								</span>
							</div>
							{!isLastVisible && (
								<button
									type="button"
									onClick={() => setSkipAllOpen(true)}
									className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-100 transition-colors md:hidden"
								>
									Skip all
								</button>
							)}
						</div>

						<Scoped>
							<ol className="hidden md:flex flex-col gap-0.5 mt-12">
								{visibleStepIds.map((id, index) => {
									const step = steps.find((s) => s.id === id)!;
									const isDone = index < visibleIndex;
									const isCurrent = stepper.current.id === step.id;
									return (
										<li key={step.id} className="flex gap-3.5">
											<div className="flex flex-col items-center">
												<span
													className={`flex items-center justify-center font-mono text-[11px] tabular-nums size-5 rounded-full ${
														isCurrent
															? "bg-white text-zinc-950 font-semibold"
															: isDone
																? "text-zinc-100"
																: "text-zinc-400"
													}`}
												>
													{isDone ? (
														<CheckIcon className="size-3" />
													) : (
														String(index + 1).padStart(2, "0")
													)}
												</span>
												{index < visibleStepIds.length - 1 && (
													<span
														className={`w-px flex-1 min-h-7 my-1.5 ${
															isDone ? "bg-zinc-400" : "bg-zinc-700"
														}`}
													/>
												)}
											</div>
											{isDone ? (
												<button
													type="button"
													onClick={() => stepper.goTo(step.id)}
													className="text-sm font-medium transition-colors pb-6 last:pb-0 text-zinc-100 hover:text-white text-left"
												>
													{step.title}
												</button>
											) : (
												<p
													className={`text-sm font-medium transition-colors pb-6 last:pb-0 ${
														isCurrent ? "text-white" : "text-zinc-400"
													}`}
												>
													{step.title}
												</p>
											)}
										</li>
									);
								})}
							</ol>
						</Scoped>

						<div className="hidden md:flex flex-col gap-4 mt-auto pt-8 border-t border-zinc-800">
							{!isLastVisible && (
								<button
									type="button"
									onClick={() => setSkipAllOpen(true)}
									className="w-fit font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-100 transition-colors"
								>
									Skip all →
								</button>
							)}
							<div className="flex items-center gap-3 text-zinc-500">
								<Link
									href="https://github.com/dokploy/dokploy"
									target="_blank"
									className="hover:text-zinc-200 transition-colors"
								>
									<GithubIcon />
								</Link>
								<Link
									href="https://x.com/getdokploy"
									target="_blank"
									className="hover:text-zinc-200 transition-colors"
								>
									<svg
										stroke="currentColor"
										fill="currentColor"
										strokeWidth="0"
										viewBox="0 0 24 24"
										xmlns="http://www.w3.org/2000/svg"
										className="size-4"
									>
										<path d="M10.4883 14.651L15.25 21H22.25L14.3917 10.5223L20.9308 3H18.2808L13.1643 8.88578L8.75 3H1.75L9.26086 13.0145L2.31915 21H4.96917L10.4883 14.651ZM16.25 19L5.75 5H7.75L18.25 19H16.25Z" />
									</svg>
								</Link>
								<Link
									href="https://discord.com/invite/2tBnJ3jDJc"
									target="_blank"
									className="hover:text-zinc-200 transition-colors"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 48 48"
										className="size-4"
									>
										<path
											fill="currentColor"
											d="M39.248,10.177c-2.804-1.287-5.812-2.235-8.956-2.778c-0.057-0.01-0.114,0.016-0.144,0.068	c-0.387,0.688-0.815,1.585-1.115,2.291c-3.382-0.506-6.747-0.506-10.059,0c-0.3-0.721-0.744-1.603-1.133-2.291	c-0.03-0.051-0.087-0.077-0.144-0.068c-3.143,0.541-6.15,1.489-8.956,2.778c-0.024,0.01-0.045,0.028-0.059,0.051	c-5.704,8.522-7.267,16.835-6.5,25.044c0.003,0.04,0.026,0.079,0.057,0.103c3.763,2.764,7.409,4.442,10.987,5.554	c0.057,0.017,0.118-0.003,0.154-0.051c0.846-1.156,1.601-2.374,2.248-3.656c0.038-0.075,0.002-0.164-0.076-0.194	c-1.197-0.454-2.336-1.007-3.432-1.636c-0.087-0.051-0.094-0.175-0.014-0.234c0.231-0.173,0.461-0.353,0.682-0.534	c0.04-0.033,0.095-0.04,0.142-0.019c7.201,3.288,14.997,3.288,22.113,0c0.047-0.023,0.102-0.016,0.144,0.017	c0.22,0.182,0.451,0.363,0.683,0.536c0.08,0.059,0.075,0.183-0.012,0.234c-1.096,0.641-2.236,1.182-3.434,1.634	c-0.078,0.03-0.113,0.12-0.075,0.196c0.661,1.28,1.415,2.498,2.246,3.654c0.035,0.049,0.097,0.07,0.154,0.052	c3.595-1.112,7.241-2.79,11.004-5.554c0.033-0.024,0.054-0.061,0.057-0.101c0.917-9.491-1.537-17.735-6.505-25.044	C39.293,10.205,39.272,10.187,39.248,10.177z M16.703,30.273c-2.168,0-3.954-1.99-3.954-4.435s1.752-4.435,3.954-4.435	c2.22,0,3.989,2.008,3.954,4.435C20.658,28.282,18.906,30.273,16.703,30.273z M31.324,30.273c-2.168,0-3.954-1.99-3.954-4.435	s1.752-4.435,3.954-4.435c2.22,0,3.989,2.008,3.954,4.435C35.278,28.282,33.544,30.273,31.324,30.273z"
										/>
									</svg>
								</Link>
							</div>
						</div>
					</div>
				</aside>

				<div className="flex-1 overflow-y-auto">
					<div className="mx-auto w-full max-w-2xl px-6 py-14 lg:py-20">
						{stepper.switch({
							welcome: () => <WelcomeStep onNext={goToNextVisible} />,
							plan: () => <PlanStep onNext={goToNextVisible} />,
							project: () => (
								<ProjectStep
									onNext={(project) => {
										setProjectId(project.projectId);
										setEnvironmentId(project.environmentId);
										setOnboardingState({
											projectId: project.projectId,
											environmentId: project.environmentId,
										});
										goToNextVisible();
									}}
								/>
							),
							server: () => <ServerStep onNext={goToNextVisible} />,
							deploy: () => (
								<DeployStep
									environmentId={environmentId}
									onNext={goToNextVisible}
								/>
							),
							complete: () => (
								<CompleteStep
									projectId={projectId}
									environmentId={environmentId}
									onFinish={onClose}
								/>
							),
						})}
					</div>
				</div>
			</div>

			<Dialog open={skipAllOpen} onOpenChange={setSkipAllOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Skip onboarding?</DialogTitle>
						<DialogDescription>
							If this is your first time using Dokploy, we recommend going
							through these steps — it only takes a couple of minutes and gives
							you a feel for how projects, servers and deployments fit together.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setSkipAllOpen(false)}>
							Continue setup
						</Button>
						<Button onClick={handleSkipAll}>Skip anyway</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
