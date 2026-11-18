import {
	getWebServerSettings,
	IS_CLOUD,
	isAdminPresent,
} from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Fingerprint } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { SignInWithGithub } from "@/components/proprietary/auth/sign-in-with-github";
import { SignInWithGoogle } from "@/components/proprietary/auth/sign-in-with-google";
import { SignInWithSSO } from "@/components/proprietary/sso/sign-in-with-sso";
import { AlertBlock } from "@/components/shared/alert-block";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { generateServerSideHelper } from "@/utils/create-server-helpers";
import { useWhitelabelingPublic } from "@/utils/hooks/use-whitelabeling";

const LoginSchema = z.object({
	email: z.string().trim().email(),
	password: z.string().min(8),
});

const _TwoFactorSchema = z.object({
	code: z.string().min(6),
});

type LoginForm = z.infer<typeof LoginSchema>;

interface Props {
	IS_CLOUD: boolean;
	enforceSSO: boolean;
}
export default function Home({ IS_CLOUD, enforceSSO }: Props) {
	const router = useRouter();
	const { t } = useTranslation();
	const { config: whitelabeling } = useWhitelabelingPublic();
	const { data: showSignInWithSSO } = api.sso.showSignInWithSSO.useQuery();
	const [isLoginLoading, setIsLoginLoading] = useState(false);
	const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
	const [isTwoFactorLoading, setIsTwoFactorLoading] = useState(false);
	const [isBackupCodeLoading, setIsBackupCodeLoading] = useState(false);
	const [isTwoFactor, setIsTwoFactor] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [twoFactorCode, setTwoFactorCode] = useState("");
	const [twoFactorCaret, setTwoFactorCaret] = useState(0);
	// Clamped so a caret left over from before the code was cleared can't point past it.
	const twoFactorCursor = Math.min(twoFactorCaret, twoFactorCode.length);
	const [isBackupCodeModalOpen, setIsBackupCodeModalOpen] = useState(false);
	const [backupCode, setBackupCode] = useState("");
	const [showForgotPassword, setShowForgotPassword] = useState(false);

	const hasCustomPasswordReset = !IS_CLOUD && !!whitelabeling?.supportEmail;
	const loginForm = useForm<LoginForm>({
		resolver: zodResolver(LoginSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	useEffect(() => {
		const queryError = router.query.error;
		if (!queryError) return;

		const raw = Array.isArray(queryError) ? queryError[0] : queryError;
		if (!raw) return;
		const normalized = raw.replace(/[+_]/g, " ").toLowerCase();

		setError(
			normalized.includes("account not linked")
				? t("auth.errors.accountNotLinked")
				: normalized.includes("access denied")
					? t("auth.errors.accessDenied")
					: t("auth.errors.signInFailed"),
		);

		const { error: _removed, ...rest } = router.query;
		router.replace({ pathname: router.pathname, query: rest }, undefined, {
			shallow: true,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.query.error]);

	const onSubmit = async (values: LoginForm) => {
		setIsLoginLoading(true);
		try {
			const { data, error } = await authClient.signIn.email({
				email: values.email,
				password: values.password,
			});

			if (error) {
				const isEmailNotVerified =
					error.code === "EMAIL_NOT_VERIFIED" ||
					error.message?.toLowerCase().includes("email not verified");
				if (isEmailNotVerified) {
					const msg = t("auth.errors.emailNotVerified");
					toast.info(msg);
					setError(msg);
					return;
				}
				toast.error(error.message);
				setError(error.message || t("auth.errors.loginFailed"));
				return;
			}

			if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
				setTwoFactorCode("");
				setIsTwoFactor(true);
				toast.info(t("auth.success.enter2FA"));
				return;
			}

			toast.success(t("auth.success.loggedIn"));
			router.push("/dashboard/home");
		} catch {
			toast.error(t("auth.errors.loginFailed"));
		} finally {
			setIsLoginLoading(false);
		}
	};
	const onPasskeySignIn = async () => {
		setIsPasskeyLoading(true);
		try {
			const { data, error } = await authClient.signIn.passkey();

			if (error) {
				const errorCode = "code" in error ? error.code : undefined;
				if (
					errorCode !== "AUTH_CANCELLED" &&
					errorCode !== "ERROR_CEREMONY_ABORTED"
				) {
					toast.error(error.message || t("auth.errors.passkeyFailed"));
					setError(error.message || t("auth.errors.passkeyFailed"));
				}
				return;
			}

			if (data) {
				toast.success(t("auth.success.loggedIn"));
				router.push("/dashboard/home");
			}
		} catch {
			toast.error(t("auth.errors.passkeyFailedGeneric"));
		} finally {
			setIsPasskeyLoading(false);
		}
	};

	const onTwoFactorSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (twoFactorCode.length !== 6) {
			toast.error(t("auth.twoFactor.invalidCode"));
			return;
		}
		await verifyTwoFactorCode(twoFactorCode);
	};

	const verifyTwoFactorCode = async (code: string) => {
		if (isTwoFactorLoading) return;

		setIsTwoFactorLoading(true);
		try {
			const { error } = await authClient.twoFactor.verifyTotp({ code });

			if (error) {
				toast.error(error.message);
				setError(error.message || t("auth.errors.twoFactorFailed"));
				return;
			}

			toast.success(t("auth.success.loggedIn"));
			router.push("/dashboard/home");
		} catch {
			toast.error(t("auth.errors.twoFactorFailed"));
		} finally {
			setIsTwoFactorLoading(false);
		}
	};

	const onBackupCodeSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (backupCode.length < 8) {
			toast.error(t("auth.twoFactor.invalidBackupCode"));
			return;
		}

		setIsBackupCodeLoading(true);
		try {
			const { error } = await authClient.twoFactor.verifyBackupCode({
				code: backupCode.trim(),
			});

			if (error) {
				toast.error(error.message);
				setError(error.message || t("auth.errors.backupCodeFailed"));
				return;
			}

			toast.success(t("auth.success.loggedIn"));
			router.push("/dashboard/home");
		} catch {
			toast.error(t("auth.errors.backupCodeFailed"));
		} finally {
			setIsBackupCodeLoading(false);
		}
	};

	const loginContent = (
		<>
			{IS_CLOUD && <SignInWithGithub />}
			{IS_CLOUD && <SignInWithGoogle />}
			<Form {...loginForm}>
				<form
					method="post"
					onSubmit={loginForm.handleSubmit(onSubmit)}
					className="space-y-4"
					id="login-form"
				>
					<FormField
						control={loginForm.control}
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel>{t("common.email")}</FormLabel>
								<FormControl>
									<Input placeholder="john@example.com" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={loginForm.control}
						name="password"
						render={({ field }) => (
							<FormItem>
								<FormLabel>{t("common.password")}</FormLabel>
								<FormControl>
									<Input
										type="password"
										placeholder="Enter your password"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button className="w-full" type="submit" isLoading={isLoginLoading}>
						{t("auth.signIn.login")}
					</Button>
				</form>
			</Form>
			<Button
				variant="outline"
				className="w-full mt-4"
				type="button"
				onClick={onPasskeySignIn}
				isLoading={isPasskeyLoading}
			>
				<Fingerprint className="size-4" />
				{t("auth.signIn.signInWithPasskey")}
			</Button>
		</>
	);

	const forgotPasswordContent = (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground whitespace-pre-line">
				{whitelabeling?.passwordResetGuide ||
					t("auth.forgotPassword.description")}
			</p>
			<Button className="w-full" asChild>
				<a href={`mailto:${whitelabeling?.supportEmail}`}>
					{t("auth.forgotPassword.getSupport")}
				</a>
			</Button>
		</div>
	);

	return (
		<>
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					<div className="flex flex-row items-center justify-center gap-2">
						<Logo
							className="size-12"
							logoUrl={
								whitelabeling?.loginLogoUrl ||
								whitelabeling?.logoUrl ||
								undefined
							}
							logoLightUrl={
								whitelabeling?.loginLogoLightUrl ||
								whitelabeling?.logoLightUrl ||
								undefined
							}
						/>
						{t("auth.signIn.title")}
					</div>
				</h1>
				<p className="text-sm text-muted-foreground">
					{t("auth.signIn.subtitle")}
				</p>
			</div>
			{error && (
				<AlertBlock type="error" className="my-2">
					<span>{error}</span>
				</AlertBlock>
			)}
			<CardContent className="p-0">
				{!isTwoFactor ? (
					showForgotPassword ? (
						forgotPasswordContent
					) : (
						<>
							{enforceSSO ? (
								<SignInWithSSO enforce />
							) : showSignInWithSSO ? (
								<SignInWithSSO>{loginContent}</SignInWithSSO>
							) : (
								loginContent
							)}
						</>
					)
				) : (
					<>
						<form
							method="post"
							onSubmit={onTwoFactorSubmit}
							className="space-y-4"
							id="two-factor-form"
							autoComplete="on"
						>
							<div className="flex flex-col gap-2">
								<Label htmlFor="totp-code">{t("auth.twoFactor.code")}</Label>
								{/* Visible input so password managers can autofill it */}
								<div className="group relative isolate w-56">
									<Input
										id="totp-code"
										name="totp"
										value={twoFactorCode}
										onChange={(e) => {
											const code = e.target.value.replace(/\D/g, "");
											setTwoFactorCode(code);
											setTwoFactorCaret(e.target.selectionStart ?? code.length);
											if (code.length === 6) verifyTwoFactorCode(code);
										}}
										onSelect={(e) =>
											setTwoFactorCaret(e.currentTarget.selectionStart ?? 0)
										}
										autoComplete="one-time-code"
										inputMode="numeric"
										maxLength={6}
										readOnly={isTwoFactorLoading}
										autoFocus
										className={cn(
											"h-8 border-0 py-0 pr-0 pl-[calc((2rem_-_1ch)/2)] font-mono text-base tracking-[calc(2rem_-_1ch)] focus-visible:ring-0 md:text-base dark:bg-transparent",
											twoFactorCursor === 6 && "caret-transparent",
										)}
									/>
									<div
										aria-hidden
										className="pointer-events-none absolute inset-y-0 left-0 -z-10 flex"
									>
										{[0, 1, 2, 3, 4, 5].map((slot) => (
											<div
												key={slot}
												data-active={slot === Math.min(twoFactorCursor, 5)}
												className="relative size-8 border-y border-r border-input first:rounded-l-lg first:border-l last:rounded-r-lg dark:bg-input/30 group-focus-within:data-[active=true]:z-10 group-focus-within:data-[active=true]:border-ring group-focus-within:data-[active=true]:ring-3 group-focus-within:data-[active=true]:ring-ring/50"
											/>
										))}
									</div>
								</div>
								<CardDescription>
									{t("auth.twoFactor.enterCodeHint")}
								</CardDescription>
								<button
									type="button"
									onClick={() => setIsBackupCodeModalOpen(true)}
									className="text-sm text-muted-foreground hover:underline self-start mt-2"
								>
									{t("auth.twoFactor.lostAuthenticator")}
								</button>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<Button
									variant="outline"
									className="w-full"
									type="button"
									onClick={() => {
										setIsTwoFactor(false);
										setTwoFactorCode("");
									}}
								>
									{t("common.back")}
								</Button>
								<Button
									className="w-full"
									type="submit"
									isLoading={isTwoFactorLoading}
								>
									{t("common.verify")}
								</Button>
							</div>
						</form>

						<Dialog
							open={isBackupCodeModalOpen}
							onOpenChange={setIsBackupCodeModalOpen}
						>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>
										{t("auth.twoFactor.enterBackupCode")}
									</DialogTitle>
									<DialogDescription>
										{t("auth.twoFactor.enterBackupCodeDescription")}
									</DialogDescription>
								</DialogHeader>

								<form
									method="post"
									onSubmit={onBackupCodeSubmit}
									className="space-y-4"
								>
									<div className="flex flex-col gap-2">
										<Label>{t("auth.twoFactor.backupCode")}</Label>
										<Input
											value={backupCode}
											onChange={(e) => setBackupCode(e.target.value)}
											placeholder={t("auth.twoFactor.backupCodePlaceholder")}
											className="font-mono"
										/>
										<CardDescription>
											{t("auth.twoFactor.backupCodeHint")}
										</CardDescription>
									</div>

									<div className="flex gap-4">
										<Button
											variant="outline"
											className="w-full"
											type="button"
											onClick={() => {
												setIsBackupCodeModalOpen(false);
												setBackupCode("");
											}}
										>
											{t("common.cancel")}
										</Button>
										<Button
											className="w-full"
											type="submit"
											isLoading={isBackupCodeLoading}
										>
											{t("common.verify")}
										</Button>
									</div>
								</form>
							</DialogContent>
						</Dialog>
					</>
				)}

				<div className="flex flex-row justify-between flex-wrap">
					<div className="mt-4 text-center text-sm flex flex-row justify-center gap-2">
						{IS_CLOUD && (
							<Link
								className="hover:underline text-muted-foreground"
								href="/register"
							>
								{t("auth.signIn.createAccount")}
							</Link>
						)}
					</div>

					<div className="mt-4 text-sm flex flex-row justify-center gap-2">
						{IS_CLOUD ? (
							<Link
								className="hover:underline text-muted-foreground"
								href="/send-reset-password"
							>
								{t("auth.signIn.lostPassword")}
							</Link>
						) : hasCustomPasswordReset && !isTwoFactor ? (
							<button
								type="button"
								className="hover:underline text-muted-foreground"
								onClick={() => setShowForgotPassword((prev) => !prev)}
							>
								{showForgotPassword
									? t("auth.signIn.goBackToLogin")
									: t("auth.signIn.lostPassword")}
							</button>
						) : !hasCustomPasswordReset ? (
							<Link
								className="hover:underline text-muted-foreground"
								href="https://docs.dokploy.com/docs/core/reset-password"
								target="_blank"
							>
								{t("auth.signIn.lostPassword")}
							</Link>
						) : null}
					</div>
				</div>
				<div className="p-2" />
			</CardContent>
		</>
	);
}

Home.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};
export async function getServerSideProps(context: GetServerSidePropsContext) {
	const helpers = generateServerSideHelper(appRouter, context);
	// Prefetch the public branding so the login/onboarding logo and app name
	// render correctly on the server (no flash of default branding).
	await helpers.whitelabeling.getPublic.prefetch();
	await helpers.sso.showSignInWithSSO.prefetch();

	if (IS_CLOUD) {
		try {
			const { user } = await validateRequest(context.req);
			if (user) {
				return {
					redirect: {
						permanent: false,
						destination: "/dashboard/home",
					},
				};
			}
		} catch {}

		return {
			props: {
				trpcState: helpers.dehydrate(),
				IS_CLOUD: IS_CLOUD,
				enforceSSO: false,
			},
		};
	}
	const hasAdmin = await isAdminPresent();

	if (!hasAdmin) {
		return {
			redirect: {
				permanent: false,
				destination: "/register",
			},
		};
	}

	const { user } = await validateRequest(context.req);

	if (user) {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/home",
			},
		};
	}

	const webServerSettings = await getWebServerSettings();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			hasAdmin,
			enforceSSO: webServerSettings?.enforceSSO ?? false,
		},
	};
}
