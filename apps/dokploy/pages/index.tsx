import { IS_CLOUD, isAdminPresent } from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useState } from "react";
import { useForm } from "react-hook-form";
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
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

const LoginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
});

const _TwoFactorSchema = z.object({
	code: z.string().min(6),
});

type LoginForm = z.infer<typeof LoginSchema>;

interface Props {
	IS_CLOUD: boolean;
}
export default function Home({ IS_CLOUD }: Props) {
	const router = useRouter();
	const { data: showSignInWithSSO } = api.sso.showSignInWithSSO.useQuery();
	const [isLoginLoading, setIsLoginLoading] = useState(false);
	const [isTwoFactorLoading, setIsTwoFactorLoading] = useState(false);
	const [isBackupCodeLoading, setIsBackupCodeLoading] = useState(false);
	const [isTwoFactor, setIsTwoFactor] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [twoFactorCode, setTwoFactorCode] = useState("");
	const [isBackupCodeModalOpen, setIsBackupCodeModalOpen] = useState(false);
	const [backupCode, setBackupCode] = useState("");
	const loginForm = useForm<LoginForm>({
		resolver: zodResolver(LoginSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	const onSubmit = async (values: LoginForm) => {
		setIsLoginLoading(true);
		try {
			const { data, error } = await authClient.signIn.email({
				email: values.email,
				password: values.password,
			});

			if (error) {
				toast.error(error.message);
				setError(error.message || "An error occurred while logging in");
				return;
			}

			// @ts-ignore
			if (data?.twoFactorRedirect as boolean) {
				setTwoFactorCode("");
				setIsTwoFactor(true);
				toast.info("Please enter your 2FA code");
				return;
			}

			toast.success("Logged in successfully");
			router.push("/dashboard/projects");
		} catch {
			toast.error("An error occurred while logging in");
		} finally {
			setIsLoginLoading(false);
		}
	};
	const onTwoFactorSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (twoFactorCode.length !== 6) {
			toast.error("Please enter a valid 6-digit code");
			return;
		}

		setIsTwoFactorLoading(true);
		try {
			const { error } = await authClient.twoFactor.verifyTotp({
				code: twoFactorCode.replace(/\s/g, ""),
			});

			if (error) {
				toast.error(error.message);
				setError(error.message || "An error occurred while verifying 2FA code");
				return;
			}

			toast.success("Logged in successfully");
			router.push("/dashboard/projects");
		} catch {
			toast.error("An error occurred while verifying 2FA code");
		} finally {
			setIsTwoFactorLoading(false);
		}
	};

	const onBackupCodeSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (backupCode.length < 8) {
			toast.error("Please enter a valid backup code");
			return;
		}

		setIsBackupCodeLoading(true);
		try {
			const { error } = await authClient.twoFactor.verifyBackupCode({
				code: backupCode.trim(),
			});

			if (error) {
				toast.error(error.message);
				setError(
					error.message || "An error occurred while verifying backup code",
				);
				return;
			}

			toast.success("Logged in successfully");
			router.push("/dashboard/projects");
		} catch {
			toast.error("An error occurred while verifying backup code");
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
					onSubmit={loginForm.handleSubmit(onSubmit)}
					className="space-y-4"
					id="login-form"
				>
					<FormField
						control={loginForm.control}
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Email</FormLabel>
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
								<FormLabel>Password</FormLabel>
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
						Login
					</Button>
				</form>
			</Form>
		</>
	);

	return (
		<>
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					<div className="flex flex-row items-center justify-center gap-2">
						<Logo className="size-12" />
						Sign in
					</div>
				</h1>
				<p className="text-sm text-muted-foreground">
					Enter your email and password to sign in
				</p>
			</div>
			{error && (
				<AlertBlock type="error" className="my-2">
					<span>{error}</span>
				</AlertBlock>
			)}
			<CardContent className="p-0">
				{!isTwoFactor ? (
					<>
						{showSignInWithSSO ? (
							<SignInWithSSO>{loginContent}</SignInWithSSO>
						) : (
							loginContent
						)}
					</>
				) : (
					<>
						<form
							onSubmit={onTwoFactorSubmit}
							className="space-y-4"
							id="two-factor-form"
							autoComplete="off"
						>
							<div className="flex flex-col gap-2">
								<Label>2FA Code</Label>
								<InputOTP
									value={twoFactorCode}
									onChange={setTwoFactorCode}
									maxLength={6}
									pattern={REGEXP_ONLY_DIGITS}
									autoFocus
								>
									<InputOTPGroup>
										<InputOTPSlot index={0} className="border-border" />
										<InputOTPSlot index={1} className="border-border" />
										<InputOTPSlot index={2} className="border-border" />
										<InputOTPSlot index={3} className="border-border" />
										<InputOTPSlot index={4} className="border-border" />
										<InputOTPSlot index={5} className="border-border" />
									</InputOTPGroup>
								</InputOTP>
								<CardDescription>
									Enter the 6-digit code from your authenticator app
								</CardDescription>
								<button
									type="button"
									onClick={() => setIsBackupCodeModalOpen(true)}
									className="text-sm text-muted-foreground hover:underline self-start mt-2"
								>
									Lost access to your authenticator app?
								</button>
							</div>

							<div className="flex gap-4">
								<Button
									variant="outline"
									className="w-full"
									type="button"
									onClick={() => {
										setIsTwoFactor(false);
										setTwoFactorCode("");
									}}
								>
									Back
								</Button>
								<Button
									className="w-full"
									type="submit"
									isLoading={isTwoFactorLoading}
								>
									Verify
								</Button>
							</div>
						</form>

						<Dialog
							open={isBackupCodeModalOpen}
							onOpenChange={setIsBackupCodeModalOpen}
						>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Enter Backup Code</DialogTitle>
									<DialogDescription>
										Enter one of your backup codes to access your account
									</DialogDescription>
								</DialogHeader>

								<form onSubmit={onBackupCodeSubmit} className="space-y-4">
									<div className="flex flex-col gap-2">
										<Label>Backup Code</Label>
										<Input
											value={backupCode}
											onChange={(e) => setBackupCode(e.target.value)}
											placeholder="Enter your backup code"
											className="font-mono"
										/>
										<CardDescription>
											Enter one of the backup codes you received when setting up
											2FA
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
											Cancel
										</Button>
										<Button
											className="w-full"
											type="submit"
											isLoading={isBackupCodeLoading}
										>
											Verify
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
								Create an account
							</Link>
						)}
					</div>

					<div className="mt-4 text-sm flex flex-row justify-center gap-2">
						{IS_CLOUD ? (
							<Link
								className="hover:underline text-muted-foreground"
								href="/send-reset-password"
							>
								Lost your password?
							</Link>
						) : (
							<Link
								className="hover:underline text-muted-foreground"
								href="https://docs.dokploy.com/docs/core/reset-password"
								target="_blank"
							>
								Lost your password?
							</Link>
						)}
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
	if (IS_CLOUD) {
		try {
			const { user } = await validateRequest(context.req);
			if (user) {
				return {
					redirect: {
						permanent: true,
						destination: "/dashboard/projects",
					},
				};
			}
		} catch {}

		return {
			props: {
				IS_CLOUD: IS_CLOUD,
			},
		};
	}
	const hasAdmin = await isAdminPresent();

	if (!hasAdmin) {
		return {
			redirect: {
				permanent: true,
				destination: "/register",
			},
		};
	}

	const { user } = await validateRequest(context.req);

	if (user) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}

	return {
		props: {
			hasAdmin,
		},
	};
}
