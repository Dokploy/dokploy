import { Login2FA } from "@/components/auth/login-2fa";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { Logo } from "@/components/shared/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { IS_CLOUD, isAdminPresent, validateRequest } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
	email: z
		.string()
		.min(1, {
			message: "Email is required",
		})
		.email({
			message: "Email must be a valid email",
		}),

	password: z
		.string()
		.min(1, {
			message: "Password is required",
		})
		.min(8, {
			message: "Password must be at least 8 characters",
		}),
});

type Login = z.infer<typeof loginSchema>;

type AuthResponse = {
	is2FAEnabled: boolean;
	authId: string;
};

interface Props {
	IS_CLOUD: boolean;
}
export default function Home({ IS_CLOUD }: Props) {
	const [temp, setTemp] = useState<AuthResponse>({
		is2FAEnabled: false,
		authId: "",
	});
	const { mutateAsync, isLoading, error, isError } =
		api.auth.login.useMutation();
	const router = useRouter();
	const form = useForm<Login>({
		defaultValues: {
			email: "",
			password: "",
		},
		resolver: zodResolver(loginSchema),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (values: Login) => {
		await mutateAsync({
			email: values.email.toLowerCase(),
			password: values.password,
		})
			.then((data) => {
				if (data.is2FAEnabled) {
					setTemp(data);
				} else {
					toast.success("Successfully signed in", {
						duration: 2000,
					});
					router.push("/dashboard/projects");
				}
			})
			.catch(() => {
				toast.error("Signin failed", {
					duration: 2000,
				});
			});
	};
	return (
		<>
			<div className="md:hidden">
				<img
					src="/examples/authentication-light.png"
					width={1280}
					height={843}
					alt="Authentication"
					className="block dark:hidden"
				/>
				<img
					src="/examples/authentication-dark.png"
					width={1280}
					height={843}
					alt="Authentication"
					className="hidden dark:block"
				/>
			</div>
			<div className="container relative hidden h-[900px] flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
				<Link
					href="/register"
					className={cn(
						buttonVariants({ variant: "ghost" }),
						"absolute right-4 top-4 md:right-8 md:top-8",
					)}
				>
					Sign Up
				</Link>
				<div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
					<div className="absolute inset-0 bg-zinc-900" />
					<Link
						href="https://dokploy.com"
						className="relative z-20 flex items-center text-lg font-medium gap-4"
					>
						<Logo className="size-10" />
						Dokploy
					</Link>
					<div className="relative z-20 mt-auto">
						<blockquote className="space-y-2">
							<p className="text-lg">
								&ldquo;The Open Source alternative to Netlify, Vercel,
								Heroku.&rdquo;
							</p>
							{/* <footer className="text-sm">Sofia Davis</footer> */}
						</blockquote>
					</div>
				</div>
				<div>
					<div className="mx-auto flex w-full flex-col justify-center space-y-6 max-w-lg">
						<div className="flex flex-col space-y-2 text-center">
							<h1 className="text-2xl font-semibold tracking-tight">
								<div className="flex flex-row items-center justify-center gap-2">
									<Logo className="size-10" />
									Sign in
								</div>
							</h1>
							<p className="text-sm text-muted-foreground">
								Enter your email below to sign in to your account
							</p>
						</div>

						{isError && (
							<AlertBlock type="error" className="mx-4 my-2">
								<span>{error?.message}</span>
							</AlertBlock>
						)}

						<CardContent>
							{!temp.is2FAEnabled ? (
								<Form {...form}>
									<form
										onSubmit={form.handleSubmit(onSubmit)}
										className="grid gap-4"
									>
										<div className="space-y-4">
											<FormField
												control={form.control}
												name="email"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Email</FormLabel>
														<FormControl>
															<Input placeholder="Email" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="password"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Password</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder="Password"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>

											<Button
												type="submit"
												isLoading={isLoading}
												className="w-full"
											>
												Login
											</Button>
										</div>
									</form>
								</Form>
							) : (
								<Login2FA authId={temp.authId} />
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

						{/* <p className="px-8 text-center text-sm text-muted-foreground">
							By clicking continue, you agree to our{" "}
							<Link
								href="/terms"
								className="underline underline-offset-4 hover:text-primary"
							>
								Terms of Service
							</Link>{" "}
							and{" "}
							<Link
								href="/privacy"
								className="underline underline-offset-4 hover:text-primary"
							>
								Privacy Policy
							</Link>
							.
						</p> */}
					</div>
				</div>
			</div>
		</>
	);
}

Home.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};
export async function getServerSideProps(context: GetServerSidePropsContext) {
	if (IS_CLOUD) {
		try {
			const { user } = await validateRequest(context.req, context.res);

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

	const { user } = await validateRequest(context.req, context.res);

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
