import { IS_CLOUD, isAdminPresent, validateRequest } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
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

const registerSchema = z
	.object({
		name: z.string().min(1, {
			message: "Name is required",
		}),
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
			.refine((password) => password === "" || password.length >= 8, {
				message: "Password must be at least 8 characters",
			}),
		confirmPassword: z
			.string()
			.min(1, {
				message: "Password is required",
			})
			.refine(
				(confirmPassword) =>
					confirmPassword === "" || confirmPassword.length >= 8,
				{
					message: "Password must be at least 8 characters",
				},
			),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

type Register = z.infer<typeof registerSchema>;

interface Props {
	hasAdmin: boolean;
	isCloud: boolean;
}

const Register = ({ isCloud }: Props) => {
	const router = useRouter();
	const [isError, setIsError] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [data, setData] = useState<any>(null);

	const form = useForm<Register>({
		defaultValues: {
			name: "",
			email: "",
			password: "",
			confirmPassword: "",
		},
		resolver: zodResolver(registerSchema),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (values: Register) => {
		const { data, error } = await authClient.signUp.email({
			email: values.email,
			password: values.password,
			name: values.name,
		});

		if (error) {
			setIsError(true);
			setError(error.message || "An error occurred");
		} else {
			toast.success("User registered successfuly", {
				duration: 2000,
			});
			if (!isCloud) {
				router.push("/");
			} else {
				setData(data);
			}
		}
	};
	return (
		<div className="">
			<div className="flex  w-full items-center justify-center ">
				<div className="flex flex-col items-center gap-4 w-full">
					<CardTitle className="text-2xl font-bold flex  items-center gap-2">
						<Link
							href="https://dokploy.com"
							target="_blank"
							className="flex flex-row items-center gap-2"
						>
							<Logo className="size-12" />
						</Link>
						{isCloud ? "Sign Up" : "Setup the server"}
					</CardTitle>
					<CardDescription>
						Enter your email and password to{" "}
						{isCloud ? "create an account" : "setup the server"}
					</CardDescription>
					<div className="mx-auto w-full max-w-lg bg-transparent">
						{isError && (
							<div className="my-2 flex flex-row items-center gap-2 rounded-lg bg-red-50 p-2 dark:bg-red-950">
								<AlertTriangle className="text-red-600 dark:text-red-400" />
								<span className="text-sm text-red-600 dark:text-red-400">
									{error}
								</span>
							</div>
						)}
						{isCloud && data && (
							<AlertBlock type="success" className="my-2">
								<span>
									Registered successfully, please check your inbox or spam
									folder to confirm your account.
								</span>
							</AlertBlock>
						)}
						<CardContent className="p-0">
							<Form {...form}>
								<form
									onSubmit={form.handleSubmit(onSubmit)}
									className="grid gap-4"
								>
									<div className="space-y-4">
										<FormField
											control={form.control}
											name="name"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Name</FormLabel>
													<FormControl>
														<Input placeholder="name" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="email"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Email</FormLabel>
													<FormControl>
														<Input placeholder="email@dokploy.com" {...field} />
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
											isLoading={form.formState.isSubmitting}
											className="w-full"
										>
											Register
										</Button>
									</div>
								</form>
							</Form>
							<div className="flex flex-row justify-between flex-wrap">
								{isCloud && (
									<div className="mt-4 text-center text-sm flex gap-2 text-muted-foreground">
										Already have account?
										<Link className="underline" href="/">
											Sign in
										</Link>
									</div>
								)}

								<div className="mt-4 text-center text-sm flex flex-row justify-center gap-2  text-muted-foreground">
									Need help?
									<Link
										className="underline"
										href="https://dokploy.com"
										target="_blank"
									>
										Contact us
									</Link>
								</div>
							</div>
						</CardContent>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Register;

Register.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};
export async function getServerSideProps(context: GetServerSidePropsContext) {
	if (IS_CLOUD) {
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
				isCloud: true,
			},
		};
	}
	const hasAdmin = await isAdminPresent();

	if (hasAdmin) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}
	return {
		props: {
			isCloud: false,
		},
	};
}
