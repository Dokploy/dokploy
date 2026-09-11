const ONBOARDING_ACTIVE_KEY = "dokploy_onboarding_active";
const ONBOARDING_STATE_KEY = "dokploy_onboarding_state";

interface OnboardingState {
	stepId?: string;
	projectId?: string;
	environmentId?: string;
}

export const isOnboardingActive = () => {
	if (typeof window === "undefined") return false;
	try {
		return window.localStorage.getItem(ONBOARDING_ACTIVE_KEY) === "true";
	} catch {
		return false;
	}
};

export const markOnboardingActive = () => {
	try {
		window.localStorage.setItem(ONBOARDING_ACTIVE_KEY, "true");
	} catch {}
};

export const clearOnboardingActive = () => {
	try {
		window.localStorage.removeItem(ONBOARDING_ACTIVE_KEY);
		window.localStorage.removeItem(ONBOARDING_STATE_KEY);
	} catch {}
};

export const getOnboardingState = (): OnboardingState => {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(ONBOARDING_STATE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
};

export const setOnboardingState = (state: OnboardingState) => {
	try {
		window.localStorage.setItem(
			ONBOARDING_STATE_KEY,
			JSON.stringify({ ...getOnboardingState(), ...state }),
		);
	} catch {}
};
