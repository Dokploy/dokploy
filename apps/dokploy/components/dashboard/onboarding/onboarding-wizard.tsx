import { defineStepper } from "@stepperize/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
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
import { OnboardingShell } from "./onboarding-shell";
import { CompleteStep } from "./steps/complete-step";
import { DeployStep } from "./steps/deploy-step";
import { ProjectStep } from "./steps/project-step";
import { WelcomeStep } from "./steps/welcome-step";

const { useStepper, steps } = defineStepper(
	{ id: "welcome", title: "Welcome" },
	{ id: "project", title: "New project" },
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

	const visibleStepIds = steps.map((step) => step.id);
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
			<OnboardingShell
				steps={visibleStepIds.map((id) => ({
					id,
					title: steps.find((step) => step.id === id)!.title,
					onSelect: () => stepper.goTo(id),
				}))}
				currentIndex={visibleIndex}
				onSkip={isLastVisible ? undefined : () => setSkipAllOpen(true)}
			>
				{stepper.switch({
					welcome: () => <WelcomeStep onNext={goToNextVisible} />,
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
			</OnboardingShell>

			<Dialog open={skipAllOpen} onOpenChange={setSkipAllOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Skip onboarding?</DialogTitle>
						<DialogDescription>
							If this is your first time using Dokploy, we recommend going
							through these steps – it only takes a couple of minutes and gives
							you a feel for how projects, servers, and deployments fit
							together.
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
