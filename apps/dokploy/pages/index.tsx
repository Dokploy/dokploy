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
	const [isLoginLoading, setIsLoginLoading] = useState(false);
	const [isTwoFactorLoading, setIsTwoFactorLoading] = useState(false);
	const [isBackupCodeLoading, setIsBackupCodeLoading] = useState(false);
	const [isTwoFactor, setIsTwoFactor] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [twoFactorCode, setTwoFactorCode] = useState("");
	const [isBackupCodeModalOpen, setIsBackupCodeModalOpen] = useState(false);
	const [backupCode, setBackupCode] = useState("");
	const [isGithubLoading, setIsGithubLoading] = useState(false);
	const [isGoogleLoading, setIsGoogleLoading] = useState(false);
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

	const handleGithubSignIn = async () => {
		setIsGithubLoading(true);
		try {
			const { error } = await authClient.signIn.social({
				provider: "github",
			});

			if (error) {
				toast.error(error.message);
				return;
			}
		} catch (error) {
			toast.error("An error occurred while signing in with GitHub", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsGithubLoading(false);
		}
	};

	const handleGoogleSignIn = async () => {
		setIsGoogleLoading(true);
		try {
			const { error } = await authClient.signIn.social({
				provider: "google",
			});

			if (error) {
				toast.error(error.message);
				return;
			}
		} catch (error) {
			toast.error("An error occurred while signing in with Google", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsGoogleLoading(false);
		}
	};
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
						{IS_CLOUD && (
							<Button
								variant="outline"
								type="button"
								className="w-full mb-4"
								onClick={handleGithubSignIn}
								isLoading={isGithubLoading}
							>
								<svg viewBox="0 0 438.549 438.549" className="mr-2 size-4">
									<path
										fill="currentColor"
										d="M409.132 114.573c-19.608-33.596-46.205-60.194-79.798-79.8-33.598-19.607-70.277-29.408-110.063-29.408-39.781 0-76.472 9.804-110.063 29.408-33.596 19.605-60.192 46.204-79.8 79.8C9.803 148.168 0 184.854 0 224.63c0 47.78 13.94 90.745 41.827 128.906 27.884 38.164 63.906 64.572 108.063 79.227 5.14.954 8.945.283 11.419-1.996 2.475-2.282 3.711-5.14 3.711-8.562 0-.571-.049-5.708-.144-15.417a2549.81 2549.81 0 01-.144-25.406l-6.567 1.136c-4.187.767-9.469 1.092-15.846 1-6.374-.089-12.991-.757-19.842-1.999-6.854-1.231-13.229-4.086-19.13-8.559-5.898-4.473-10.085-10.328-12.56-17.556l-2.855-6.57c-1.903-4.374-4.899-9.233-8.992-14.559-4.093-5.331-8.232-8.945-12.419-10.848l-1.999-1.431c-1.332-.951-2.568-2.098-3.711-3.429-1.142-1.331-1.997-2.663-2.568-3.997-.572-1.335-.098-2.43 1.427-3.289 1.525-.859 4.281-1.276 8.28-1.276l5.708.853c3.807.763 8.516 3.042 14.133 6.851 5.614 3.806 10.229 8.754 13.846 14.842 4.38 7.806 9.657 13.754 15.846 17.847 6.184 4.093 12.419 6.136 18.699 6.136 6.28 0 11.704-.476 16.274-1.423 4.565-.952 8.848-2.383 12.847-4.285 1.713-12.758 6.377-22.559 13.988-29.41-10.848-1.14-20.601-2.857-29.264-5.14-8.658-2.286-17.605-5.996-26.835-11.14-9.235-5.137-16.896-11.516-22.985-19.126-6.09-7.614-11.088-17.61-14.987-29.979-3.901-12.374-5.852-26.648-5.852-42.826 0-23.035 7.52-42.637 22.557-58.817-7.044-17.318-6.379-36.732 1.997-58.24 5.52-1.715 13.706-.428 24.554 3.853 10.85 4.283 18.794 7.952 23.84 10.994 5.046 3.041 9.089 5.618 12.135 7.708 17.705-4.947 35.976-7.421 54.818-7.421s37.117 2.474 54.823 7.421l10.849-6.849c7.419-4.57 16.18-8.758 26.262-12.565 10.088-3.805 17.802-4.853 23.134-3.138 8.562 21.509 9.325 40.922 2.279 58.24 15.036 16.18 22.559 35.787 22.559 58.817 0 16.178-1.958 30.497-5.853 42.966-3.9 12.471-8.941 22.457-15.125 29.979-6.191 7.521-13.901 13.85-23.131 18.986-9.232 5.14-18.182 8.85-26.84 11.136-8.662 2.286-18.415 4.004-29.263 5.146 9.894 8.562 14.842 22.077 14.842 40.539v60.237c0 3.422 1.19 6.279 3.572 8.562 2.379 2.279 6.136 2.95 11.276 1.995 44.163-14.653 80.185-41.062 108.068-79.226 27.88-38.161 41.825-81.126 41.825-128.906-.01-39.771-9.818-76.454-29.414-110.049z"
									/>
								</svg>
								Sign in with GitHub
							</Button>
						)}
						{IS_CLOUD && (
							<Button
								variant="outline"
								type="button"
								className="w-full mb-4"
								onClick={handleGoogleSignIn}
								isLoading={isGoogleLoading}
							>
								<svg viewBox="0 0 24 24" className="mr-2 size-4">
									<path
										fill="currentColor"
										d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
									/>
									<path
										fill="currentColor"
										d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
									/>
									<path
										fill="currentColor"
										d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
									/>
									<path
										fill="currentColor"
										d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
									/>
								</svg>
								Sign in with Google
							</Button>
						)}
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
								<Button
									className="w-full"
									type="submit"
									isLoading={isLoginLoading}
								>
									Login
								</Button>
							</form>
						</Form>
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
									autoComplete="off"
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
