import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
	beginConditionalPasskeySession,
	endConditionalPasskeySession,
	getPasskeyOriginPreflightError,
	isConditionalPasskeySessionStale,
	isPasskeyCeremonyAbort,
	type PasskeyError,
} from "@/lib/passkey-ceremony";

type PasskeySignInResult = {
	data: unknown;
	error: PasskeyError | null;
};

type UsePasskeyConditionalUIOptions = {
	enabled: boolean;
	onSignInResult: (result: PasskeySignInResult) => Promise<void>;
};

const isSilentConditionalFailure = (error: PasskeyError): boolean => {
	if (
		error.code === "AUTH_CANCELLED" ||
		error.code === "ERROR_CEREMONY_ABORTED" ||
		error.code === "PASSKEY_NOT_FOUND"
	) {
		return true;
	}
	if (error.message === "auth cancelled") return true;
	return false;
};

export function usePasskeyConditionalUI({
	enabled,
	onSignInResult,
}: UsePasskeyConditionalUIOptions) {
	const [conditionalActive, setConditionalActive] = useState(false);
	const onSignInResultRef = useRef(onSignInResult);

	useEffect(() => {
		onSignInResultRef.current = onSignInResult;
	}, [onSignInResult]);

	useEffect(() => {
		if (!enabled) {
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
				// Passive conditional mediation — do not use the explicit-action mutex.
				// It waits silently for email-field autofill and would block the manual
				// "Sign in with passkey" button with no visible browser prompt.
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
				if (isPasskeyCeremonyAbort(error)) return;
			} finally {
				endConditionalPasskeySession(sessionId);
				setConditionalActive(false);
			}
		};

		void startConditionalSignIn();

		return () => {
			endConditionalPasskeySession(sessionId);
			setConditionalActive(false);
		};
	}, [enabled]);

	return { conditionalActive };
};
