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
import { api } from "@/utils/api";
import { IS_CLOUD, isAdminPresent, validateRequest } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const registerSchema = z
	.object({
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
	const { mutateAsync, error, isError, data } =
		api.auth.createAdmin.useMutation();

	const form = useForm<Register>({
		defaultValues: {
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
		await mutateAsync({
			email: values.email.toLowerCase(),
			password: values.password,
		})
			.then(() => {
				toast.success("User registration succesfuly", {
					duration: 2000,
				});
				if (!isCloud) {
					router.push("/");
				}
			})
			.catch((e) => e);
	};
	return (
		<div>
			<div className="flex h-screen w-full items-center justify-center ">
				<div className="flex w-full flex-col items-center gap-4">
					<Link
						href="https://dokploy.com"
						target="_blank"
						className="flex flex-row items-center gap-2"
					>
						<Logo />
						<span className="font-medium text-sm">Dokploy</span>
					</Link>

					<CardTitle className="font-bold text-2xl">
						{isCloud ? "Create an account" : "Setup the server"}
					</CardTitle>
					<CardDescription>
						Enter your email and password to{" "}
						{isCloud ? "create an account" : "setup the server"}
					</CardDescription>
					<Card className="mx-auto w-full max-w-lg bg-transparent">
						<div className="p-3" />
						{isError && (
							<div className="mx-5 my-2 flex flex-row items-center gap-2 rounded-lg bg-red-50 p-2 dark:bg-red-950">
								<AlertTriangle className="text-red-600 dark:text-red-400" />
								<span className="text-red-600 text-sm dark:text-red-400">
									{error?.message}
								</span>
							</div>
						)}
						{data?.type === "cloud" && (
							<AlertBlock type="success" className="mx-4 my-2">
								<span>
									Registration succesfuly, Please check your inbox or spam
									folder to confirm your account.
								</span>
							</AlertBlock>
						)}
						<CardContent>
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
							<div className="flex flex-row flex-wrap justify-between">
								{isCloud && (
									<div className="mt-4 flex gap-2 text-center text-sm">
										Already have account?
										<Link className="underline" href="/">
											Sign in
										</Link>
									</div>
								)}

								<div className="mt-4 flex flex-row justify-center gap-2 text-center text-sm">
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
					</Card>
				</div>
			</div>
		</div>
	);
};

export default Register;
export async function getServerSideProps(context: GetServerSidePropsContext) {
	if (IS_CLOUD) {
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
