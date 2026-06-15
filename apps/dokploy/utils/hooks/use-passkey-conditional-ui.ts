import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
	beginConditionalPasskeySession,
	endConditionalPasskeySession,
	getPasskeyOriginPreflightError,
	isConditionalPasskeySessionStale,
	isPasskeySilentConditionalFailure,
	type PasskeyError,
} from "@/lib/passkey-ceremony";

type PasskeySignInResult = {
	data: unknown;
	error: PasskeyError | null;
};

type UsePasskeyConditionalUIOptions = {
	/** When true, conditional mediation starts only after the user focuses the email field. */
	deferUntilEmailFocus?: boolean;
	enabled: boolean;
	onSignInResult: (result: PasskeySignInResult) => Promise<void>;
};

const isSilentConditionalFailure = (error: PasskeyError): boolean => {
	if (
		error.code === "AUTH_CANCELLED" ||
		error.code === "ERROR_CEREMONY_ABORTED" ||
		error.code === "PASSKEY_UNAVAILABLE"
	) {
		return true;
	}
	if (error.message === "auth cancelled") return true;
	return false;
};

export function usePasskeyConditionalUI({
	deferUntilEmailFocus = true,
	enabled,
	onSignInResult,
}: UsePasskeyConditionalUIOptions) {
	const [conditionalActive, setConditionalActive] = useState(false);
	const [armed, setArmed] = useState(!deferUntilEmailFocus);
	const onSignInResultRef = useRef(onSignInResult);

	useEffect(() => {
		onSignInResultRef.current = onSignInResult;
	}, [onSignInResult]);

	useEffect(() => {
		if (!enabled || !armed) {
			setConditionalActive(false);
			return;
		}

		const sessionId = beginConditionalPasskeySession();

		const startConditionalSignIn = async () => {
			if (typeof window === "undefined") return;
			if (isConditionalPasskeySessionStale(sessionId)) return;
			if (!window.PublicKeyCredential?.isConditionalMediationAvailable) return;

			const available =
				await PublicKeyCredential.isConditionalMediationAvailable();
			if (!available || isConditionalPasskeySessionStale(sessionId)) return;

			if (getPasskeyOriginPreflightError()) return;

			setConditionalActive(true);
			try {
				// Passive conditional mediation — never use the explicit-action mutex.
				const result = await authClient.signIn.passkey({ autoFill: true });
				if (isConditionalPasskeySessionStale(sessionId)) return;

				if (result.error) {
					if (isSilentConditionalFailure(result.error)) return;
					return;
				}

				if (result.data) {
					await onSignInResultRef.current(result);
				}
			} catch (error) {
				if (isPasskeySilentConditionalFailure(error)) return;
				if (isConditionalPasskeySessionStale(sessionId)) return;
			} finally {
				endConditionalPasskeySession(sessionId);
				setConditionalActive(false);
			}
		};

		void startConditionalSignIn().catch(() => {
			// Swallow stray rejections from browser preemption (manual button, unmount).
		});

		return () => {
			endConditionalPasskeySession(sessionId);
			setConditionalActive(false);
		};
	}, [armed, enabled]);

	const armConditional = () => {
		setArmed(true);
	};

	return { armConditional, conditionalActive };
};
