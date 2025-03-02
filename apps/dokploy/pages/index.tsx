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
			{isError && (
				<AlertBlock type="error" className="my-2">
					<span>{error?.message}</span>
				</AlertBlock>
			)}
			<CardContent className="p-0">
				{!temp.is2FAEnabled ? (
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
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

								<Button type="submit" isLoading={isLoading} className="w-full">
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
