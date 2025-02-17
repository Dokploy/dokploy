import { Login2FA } from "@/components/auth/login-2fa";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { Logo } from "@/components/shared/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardContent, CardDescription } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
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
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { IS_CLOUD, auth, isAdminPresent } from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { Session, getSessionCookie } from "better-auth";
import { betterFetch } from "better-auth/react";
import base32 from "hi-base32";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { TOTP } from "otpauth";
import { type ReactElement, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const LoginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
});

const TwoFactorSchema = z.object({
	code: z.string().min(6),
});

type LoginForm = z.infer<typeof LoginSchema>;
type TwoFactorForm = z.infer<typeof TwoFactorSchema>;

interface Props {
	IS_CLOUD: boolean;
}
export default function Home({ IS_CLOUD }: Props) {
	const router = useRouter();
	const [isLoginLoading, setIsLoginLoading] = useState(false);
	const [isTwoFactorLoading, setIsTwoFactorLoading] = useState(false);
	const [isTwoFactor, setIsTwoFactor] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [twoFactorCode, setTwoFactorCode] = useState("");

	const loginForm = useForm<LoginForm>({
		resolver: zodResolver(LoginSchema),
		defaultValues: {
			email: "siumauricio@hotmail.com",
			password: "Password123",
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

			if (data?.twoFactorRedirect as boolean) {
				setTwoFactorCode("");
				setIsTwoFactor(true);
				toast.info("Please enter your 2FA code");
				return;
			}

			toast.success("Logged in successfully");
			router.push("/dashboard/projects");
		} catch (error) {
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
			const { data, error } = await authClient.twoFactor.verifyTotp({
				code: twoFactorCode.replace(/\s/g, ""),
			});

			if (error) {
				toast.error(error.message);
				setError(error.message || "An error occurred while verifying 2FA code");
				return;
			}

			toast.success("Logged in successfully");
			router.push("/dashboard/projects");
		} catch (error) {
			toast.error("An error occurred while verifying 2FA code");
		} finally {
			setIsTwoFactorLoading(false);
		}
	};

	const convertBase32ToHex = (base32Secret: string) => {
		try {
			// Usar asBytes() para obtener los bytes directamente
			const bytes = base32.decode.asBytes(base32Secret.toUpperCase());
			// Convertir bytes a hex
			return Buffer.from(bytes).toString("hex");
		} catch (error) {
			console.error("Error converting base32 to hex:", error);
			return base32Secret; // Fallback al valor original si hay error
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
				) : (
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
		} catch (error) {}

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
