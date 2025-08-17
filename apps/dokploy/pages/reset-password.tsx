import { IS_CLOUD } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const loginSchema = z
	.object({
		password: z
			.string()
			.min(1, {
				message: "Password is required",
			})
			.min(8, {
				message: "Password must be at least 8 characters",
			}),
		confirmPassword: z
			.string()
			.min(1, {
				message: "Password is required",
			})
			.min(8, {
				message: "Password must be at least 8 characters",
			}),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

type Login = z.infer<typeof loginSchema>;

interface Props {
	tokenResetPassword: string;
}
export default function Home({ tokenResetPassword }: Props) {
	const [token, setToken] = useState<string | null>(tokenResetPassword);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const form = useForm<Login>({
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
		resolver: zodResolver(loginSchema),
	});

	useEffect(() => {
		const token = new URLSearchParams(window.location.search).get("token");

		if (token) {
			setToken(token);
		}
	}, [token]);

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (values: Login) => {
		setIsLoading(true);
		const { error } = await authClient.resetPassword({
			newPassword: values.password,
			token: token || "",
		});

		if (error) {
			setError(error.message || "An error occurred");
		} else {
			toast.success("Password reset successfully");
			router.push("/");
		}
		setIsLoading(false);
	};
	return (
		<div className="flex  h-screen w-full items-center justify-center ">
			<div className="flex flex-col items-center gap-4 w-full">
				<CardTitle className="text-2xl font-bold flex flex-row gap-2 items-center">
					<Link href="/" className="flex flex-row items-center gap-2">
						<Logo className="size-12" />
					</Link>
					Reset Password
				</CardTitle>
				<CardDescription>
					Enter your email to reset your password
				</CardDescription>

				<div className="w-full">
					<CardContent className="p-0">
						{error && (
							<AlertBlock type="error" className="my-2">
								{error}
							</AlertBlock>
						)}
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid gap-4"
							>
								<div className="space-y-4">
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
									<FormField
										control={form.control}
										name="confirmPassword"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Confirm Password</FormLabel>
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
										Confirm
									</Button>
								</div>

								<div className="text-center text-sm flex gap-2 text-muted-foreground">
									<Link href="/">Sign in</Link>
								</div>
							</form>
						</Form>
					</CardContent>
				</div>
			</div>
		</div>
	);
}

Home.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};
export async function getServerSideProps(context: GetServerSidePropsContext) {
	if (!IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	const { token } = context.query;

	if (typeof token !== "string") {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		props: {
			tokenResetPassword: token,
		},
	};
}
