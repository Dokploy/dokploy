import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { isOnboardingScreen, type OnboardingScreen } from "@/lib/onboarding";
import { api } from "@/utils/api";
import { OnboardingShell } from "../onboarding-shell";
import { ConnectScreen } from "./connect-screen";
import { DeployScreen, type OnboardingProject } from "./deploy-screen";
import { PathScreen } from "./path-screen";
import { PlanScreen } from "./plan-screen";
import { ProviderScreen } from "./provider-screen";

const STEPS = [
	"Create account",
	"Get a server",
	"Connect it",
	"Ship something",
];
const STEP_INDEX: Record<OnboardingScreen, number> = {
	path: 1,
	plan: 1,
	provider: 1,
	connect: 2,
	deploy: 3,
};

const parseStep = (step: string | null | undefined) => {
	const [screen, provider] = (step ?? "").split(":");
	return {
		screen: isOnboardingScreen(screen) ? screen : ("path" as const),
		provider: provider || "hostinger",
	};
};

interface Props {
	initialStep?: string | null;
	onClose: () => Promise<void>;
}

export const CloudOnboarding = ({ initialStep, onClose }: Props) => {
	const router = useRouter();
	const initial = parseStep(initialStep);
	const [screen, setScreen] = useState<OnboardingScreen>(initial.screen);
	const [provider, setProvider] = useState(initial.provider);
	const [isLeaving, setIsLeaving] = useState(false);

	const utils = api.useUtils();
	const { mutate: saveStep } = api.project.saveOnboardingStep.useMutation();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const hasServer = (servers?.length ?? 0) > 0;

	useEffect(() => {
		saveStep({ step: screen === "provider" ? `provider:${provider}` : screen });
	}, [screen, provider]);

	const { data: billing } = api.stripe.getBillingStatus.useQuery();

	// Back from checkout the saved step is still the plan screen.
	useEffect(() => {
		if (billing?.hasActiveAccess && screen === "plan") {
			setScreen("path");
		}
	}, [billing?.hasActiveAccess]);

	useEffect(() => {
		if (hasServer && (screen === "path" || screen === "provider")) {
			setScreen("deploy");
		}
	}, [hasServer]);

	const leave = async (destination: string) => {
		if (isLeaving) return;
		setIsLeaving(true);
		await onClose();
		await router.push(destination);
	};

	const finish = (project?: OnboardingProject) =>
		leave(
			project?.projectId && project.environmentId
				? `/dashboard/project/${project.projectId}/environment/${project.environmentId}`
				: "/dashboard/home",
		);

	return (
		<OnboardingShell
			steps={STEPS.map((title) => ({ id: title, title }))}
			currentIndex={STEP_INDEX[screen]}
			onSkip={screen === "deploy" ? undefined : () => finish()}
			skipLabel="Look around first"
		>
			{screen === "path" && (
				<PathScreen
					onHaveServer={() => setScreen("connect")}
					onNeedServer={() => setScreen("provider")}
					onSkip={() => finish()}
					onPayNow={() => setScreen("plan")}
					canStartTrial={billing?.hasActiveAccess === false}
				/>
			)}
			{screen === "plan" && <PlanScreen onBack={() => setScreen("path")} />}
			{screen === "provider" && (
				<ProviderScreen
					provider={provider}
					onProviderChange={setProvider}
					onBack={() => setScreen("path")}
					onContinue={() => setScreen("connect")}
				/>
			)}
			{screen === "connect" && (
				<ConnectScreen
					onBack={() => setScreen("path")}
					onConnected={async () => {
						await Promise.all([
							utils.server.withSSHKey.invalidate(),
							utils.stripe.getBillingStatus.invalidate(),
							utils.project.onboardingStatus.invalidate(),
						]);
						setScreen("deploy");
					}}
				/>
			)}
			{screen === "deploy" && <DeployScreen onFinish={finish} />}
		</OnboardingShell>
	);
};
