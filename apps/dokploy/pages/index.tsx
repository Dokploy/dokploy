import { Login2FA } from "@/components/auth/login-2fa";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

export default function Home() {
	const [temp, setTemp] = useState<AuthResponse>({
		is2FAEnabled: false,
		authId: "",
	});
	const { mutateAsync, isLoading } = api.auth.login.useMutation();
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
			email: values.email,
			password: values.password,
		})
			.then((data) => {
				if (data.is2FAEnabled) {
					setTemp(data);
				} else {
					toast.success("Signin succesfully", {
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
		<div className="flex  h-screen w-full items-center justify-center ">
			<div className="flex flex-col items-center gap-4 w-full">
				<Link
					href="https://dokploy.com"
					target="_blank"
					className="flex flex-row items-center gap-2"
				>
					<Logo />
					<span className="font-medium text-sm">Dokploy</span>
				</Link>
				<CardTitle className="text-2xl font-bold">Sign in</CardTitle>
				<CardDescription>
					Enter your credentials to access your account
				</CardDescription>
				<Card className="mx-auto w-full max-w-lg bg-transparent ">
					<div className="p-3.5" />
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
								<Link
									className="hover:underline text-muted-foreground"
									href="/register"
								>
									Create an account
								</Link>
							</div>

							<div className="mt-4 text-sm flex flex-row justify-center gap-2">
								<Link
									className="hover:underline text-muted-foreground"
									href="https://docs.dokploy.com/docs/core/get-started/reset-password"
									target="_blank"
								>
									Lost your password?
								</Link>
							</div>
						</div>
						<div className="p-2" />
					</CardContent>
				</Card>
			</div>
		</div>
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
			props: {},
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
