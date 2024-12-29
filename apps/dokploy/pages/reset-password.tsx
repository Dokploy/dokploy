import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { db } from "@/server/db";
import { auth } from "@/server/db/schema";
import { api } from "@/utils/api";
import { IS_CLOUD } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import { isBefore } from "date-fns";
import { eq } from "drizzle-orm";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
	token: string;
}
export default function Home({ token }: Props) {
	const { mutateAsync, isLoading, isError, error } =
		api.auth.resetPassword.useMutation();
	const router = useRouter();
	const form = useForm<Login>({
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
		resolver: zodResolver(loginSchema),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (values: Login) => {
		await mutateAsync({
			resetPasswordToken: token,
			password: values.password,
		})
			.then((data) => {
				toast.success("Password reset successfully", {
					duration: 2000,
				});
				router.push("/");
			})
			.catch(() => {
				toast.error("Error resetting password", {
					duration: 2000,
				});
			});
	};
	return (
		<div className="flex  h-screen w-full items-center justify-center ">
			<div className="flex flex-col items-center gap-4 w-full">
				<Link href="/" className="flex flex-row items-center gap-2">
					<Logo />
					<span className="font-medium text-sm">Dokploy</span>
				</Link>
				<CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
				<CardDescription>
					Enter your email to reset your password
				</CardDescription>

				<Card className="mx-auto w-full max-w-lg bg-transparent ">
					<div className="p-3.5" />
					<CardContent>
						{isError && (
							<AlertBlock type="error" className="my-2">
								{error?.message}
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
							</form>
						</Form>
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

	const authR = await db.query.auth.findFirst({
		where: eq(auth.resetPasswordToken, token),
	});

	if (!authR || authR?.resetPasswordExpiresAt === null) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	const isExpired = isBefore(
		new Date(authR.resetPasswordExpiresAt),
		new Date(),
	);

	if (isExpired) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		props: {
			token: authR.resetPasswordToken,
		},
	};
}
