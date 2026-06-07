import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
	getPasskeyOriginPreflightError,
	isPasskeyCeremonyAbort,
	runPasskeyCeremony,
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

		let cancelled = false;

		const startConditionalSignIn = async () => {
			if (typeof window === "undefined") return;
			if (!window.PublicKeyCredential?.isConditionalMediationAvailable) return;

			const available =
				await PublicKeyCredential.isConditionalMediationAvailable();
			if (!available || cancelled) return;

			if (getPasskeyOriginPreflightError()) return;

			setConditionalActive(true);
			try {
				await runPasskeyCeremony(async () => {
					const result = await authClient.signIn.passkey({ autoFill: true });
					if (cancelled) return;

					if (result.error) {
						if (isSilentConditionalFailure(result.error)) return;
						return;
					}

					if (result.data) {
						await onSignInResultRef.current(result);
					}
				});
			} catch (error) {
				if (isPasskeyCeremonyAbort(error)) return;
			} finally {
				if (!cancelled) {
					setConditionalActive(false);
				}
			}
		};

		void startConditionalSignIn();

		return () => {
			cancelled = true;
			setConditionalActive(false);
		};
	}, [enabled]);

	return { conditionalActive };
}
