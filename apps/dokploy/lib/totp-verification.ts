import { useCallback, useRef } from "react";
import { sanitizeTotpCode } from "@/components/ui/input-otp";

export interface TotpVerificationOptions {
	verifyTotp: (
		code: string,
	) => Promise<{ error?: { message?: string } | null }>;
	onSuccess?: () => void;
	onError?: (message: string) => void;
	setIsLoading: (isLoading: boolean) => void;
	isLoading: () => boolean;
}

export function createTotpVerificationHandler(
	options: TotpVerificationOptions,
) {
	let submittedCode: string | null = null;

	const handleVerify = async (codeToVerify: string): Promise<boolean> => {
		const sanitized = sanitizeTotpCode(codeToVerify);
		if (sanitized.length !== 6) {
			return false;
		}
		if (submittedCode === sanitized || options.isLoading()) {
			return false;
		}

		submittedCode = sanitized;
		options.setIsLoading(true);

		try {
			const { error } = await options.verifyTotp(sanitized);
			if (error) {
				submittedCode = null;
				options.onError?.(
					error.message || "An error occurred while verifying 2FA code",
				);
				return false;
			}
			options.onSuccess?.();
			return true;
		} catch {
			submittedCode = null;
			options.onError?.("An error occurred while verifying 2FA code");
			return false;
		} finally {
			options.setIsLoading(false);
		}
	};

	const handleInputChange = (
		val: string,
		updateCode: (sanitized: string) => void,
	) => {
		const sanitized = sanitizeTotpCode(val);
		updateCode(sanitized);
		if (sanitized.length < 6) {
			submittedCode = null;
		} else if (sanitized.length === 6) {
			handleVerify(sanitized);
		}
	};

	const reset = () => {
		submittedCode = null;
	};

	return {
		handleVerify,
		handleInputChange,
		reset,
		getSubmittedCode: () => submittedCode,
	};
}

export interface UseTotpAutoVerifyOptions {
	verify: (code: string) => Promise<{ error?: { message?: string } | null }>;
	onSuccess?: () => void;
	onError?: (message: string) => void;
	isLoading: boolean;
	setIsLoading: (loading: boolean) => void;
	setCode: (code: string) => void;
}

export function useTotpAutoVerify({
	verify,
	onSuccess,
	onError,
	isLoading,
	setIsLoading,
	setCode,
}: UseTotpAutoVerifyOptions) {
	const hasSubmittedRef = useRef<string | null>(null);
	const isLoadingRef = useRef(isLoading);
	isLoadingRef.current = isLoading;

	const handleVerifyTotp = useCallback(
		async (codeToVerify: string): Promise<boolean> => {
			const sanitized = sanitizeTotpCode(codeToVerify);
			if (sanitized.length !== 6) {
				return false;
			}
			if (hasSubmittedRef.current === sanitized || isLoadingRef.current) {
				return false;
			}

			hasSubmittedRef.current = sanitized;
			setIsLoading(true);
			try {
				const { error } = await verify(sanitized);
				if (error) {
					hasSubmittedRef.current = null;
					onError?.(
						error.message || "An error occurred while verifying 2FA code",
					);
					return false;
				}
				onSuccess?.();
				return true;
			} catch {
				hasSubmittedRef.current = null;
				onError?.("An error occurred while verifying 2FA code");
				return false;
			} finally {
				setIsLoading(false);
			}
		},
		[onError, onSuccess, setIsLoading, verify],
	);

	const onTotpChange = useCallback(
		(val: string) => {
			const sanitized = sanitizeTotpCode(val);
			setCode(sanitized);
			if (sanitized.length < 6) {
				hasSubmittedRef.current = null;
			} else if (sanitized.length === 6) {
				handleVerifyTotp(sanitized);
			}
		},
		[handleVerifyTotp, setCode],
	);

	const resetTotpSubmission = useCallback(() => {
		hasSubmittedRef.current = null;
	}, []);

	return {
		handleVerifyTotp,
		onTotpChange,
		resetTotpSubmission,
		hasSubmittedRef,
	};
}
