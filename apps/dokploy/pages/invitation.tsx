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
import { IS_CLOUD, getUserByToken } from "@dokploy/server";
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
	token: string;
	invitation: Awaited<ReturnType<typeof getUserByToken>>;
	isCloud: boolean;
}

const Invitation = ({ token, invitation, isCloud }: Props) => {
	const router = useRouter();
	const { data } = api.admin.getUserByToken.useQuery(
		{
			token,
		},
		{
			enabled: !!token,
			initialData: invitation,
		},
	);

	const { mutateAsync, error, isError, isSuccess } =
		api.auth.createUser.useMutation();

	const form = useForm<Register>({
		defaultValues: {
			email: "",
			password: "",
			confirmPassword: "",
		},
		resolver: zodResolver(registerSchema),
	});

	useEffect(() => {
		if (data?.auth?.email) {
			form.reset({
				email: data?.auth?.email || "",
				password: "",
				confirmPassword: "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (values: Register) => {
		await mutateAsync({
			id: data?.authId,
			password: values.password,
			token: token,
		})
			.then(() => {
				toast.success("User registered successfuly", {
					description:
						"Please check your inbox or spam folder to confirm your account.",
					duration: 100000,
				});
				router.push("/dashboard/projects");
			})
			.catch((e) => e);
	};

	return (
		<div>
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
					<CardTitle className="text-2xl font-bold">Invitation</CardTitle>
					<CardDescription>
						Fill the form below to create your account
					</CardDescription>
					<Card className="mx-auto w-full max-w-md bg-transparent">
						<div className="p-3" />

						{isError && (
							<div className="mx-5 my-2 flex flex-row items-center gap-2 rounded-lg bg-red-50 p-2 dark:bg-red-950">
								<AlertTriangle className="text-red-600 dark:text-red-400" />
								<span className="text-sm text-red-600 dark:text-red-400">
									{error?.message}
								</span>
							</div>
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
														<Input disabled placeholder="Email" {...field} />
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
															placeholder="Confirm Password"
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

									<div className="mt-4 text-sm flex flex-row justify-between gap-2 w-full">
										{isCloud && (
											<>
												<Link
													className="hover:underline text-muted-foreground"
													href="/"
												>
													Login
												</Link>
												<Link
													className="hover:underline text-muted-foreground"
													href="/send-reset-password"
												>
													Lost your password?
												</Link>
											</>
										)}
									</div>
								</form>
							</Form>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
};

export default Invitation;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { query } = ctx;

	const token = query.token;

	if (typeof token !== "string") {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	try {
		const invitation = await getUserByToken(token);

		if (invitation.isExpired) {
			return {
				redirect: {
					permanent: true,
					destination: "/",
				},
			};
		}

		return {
			props: {
				isCloud: IS_CLOUD,
				token: token,
				invitation: invitation,
			},
		};
	} catch (error) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
}
