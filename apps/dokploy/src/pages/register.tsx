import { IS_CLOUD, isAdminPresent, validateRequest } from "@dokploy/server";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { AlertTriangle } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { SignInWithGithub } from "@/components/proprietary/auth/sign-in-with-github";
import { SignInWithGoogle } from "@/components/proprietary/auth/sign-in-with-google";
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
import { useWhitelabelingPublic } from "@/utils/hooks/use-whitelabeling";

type RegisterForm = {
	name: string;
	lastName: string;
	email: string;
	password: string;
	confirmPassword: string;
};

interface Props {
	hasAdmin: boolean;
	isCloud: boolean;
}

const Register = ({ isCloud }: Props) => {
	const t = useTranslations();
	const router = useRouter();
	const { config: whitelabeling } = useWhitelabelingPublic();
	const [isError, setIsError] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [data, setData] = useState<any>(null);

	const registerSchema = useMemo(
		() =>
			z
				.object({
					name: z.string().min(1, {
						message: t("register.validation.firstNameRequired"),
					}),
					lastName: z.string().min(1, {
						message: t("register.validation.lastNameRequired"),
					}),
					email: z
						.string()
						.min(1, {
							message: t("register.validation.emailRequired"),
						})
						.email({
							message: t("register.validation.emailInvalid"),
						}),
					password: z
						.string()
						.min(1, {
							message: t("register.validation.passwordRequired"),
						})
						.refine((password) => password === "" || password.length >= 8, {
							message: t("register.validation.passwordMin"),
						}),
					confirmPassword: z
						.string()
						.min(1, {
							message: t("register.validation.confirmPasswordRequired"),
						})
						.refine(
							(confirmPassword) =>
								confirmPassword === "" || confirmPassword.length >= 8,
							{
								message: t("register.validation.confirmPasswordMin"),
							},
						),
				})
				.refine((data) => data.password === data.confirmPassword, {
					message: t("register.validation.passwordsDoNotMatch"),
					path: ["confirmPassword"],
				}),
		[t],
	);

	const form = useForm<RegisterForm>({
		defaultValues: {
			name: "",
			lastName: "",
			email: "",
			password: "",
			confirmPassword: "",
		},
		resolver: zodResolver(registerSchema),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (values: RegisterForm) => {
		const { data, error } = await authClient.signUp.email({
			email: values.email,
			password: values.password,
			name: values.name,
			lastName: values.lastName,
		});

		if (error) {
			setIsError(true);
			setError(error.message || t("register.genericError"));
		} else {
			toast.success(t("register.toastSuccess"), { duration: 2000 });
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
						<Link href="/" className="flex flex-row items-center gap-2">
							<Logo
								className="size-12"
								logoUrl={
									whitelabeling?.loginLogoUrl ||
									whitelabeling?.logoUrl ||
									undefined
								}
							/>
						</Link>
						{isCloud
							? t("register.title.cloud")
							: t("register.title.selfHosted")}
					</CardTitle>
					<CardDescription>
						{isCloud
							? t("register.description.cloud")
							: t("register.description.selfHosted")}
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
								<span>{t("register.successAlert")}</span>
							</AlertBlock>
						)}
						<CardContent className="p-0">
							{isCloud && (
								<div className="flex flex-col">
									<SignInWithGithub />
									<SignInWithGoogle />
								</div>
							)}
							{isCloud && (
								<p className="mb-4 text-center text-xs text-muted-foreground">
									{t("register.orRegisterWithEmail")}
								</p>
							)}
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
													<FormLabel>{t("register.form.firstName")}</FormLabel>
													<FormControl>
														<Input
															placeholder={t("register.placeholders.firstName")}
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="lastName"
											render={({ field }) => (
												<FormItem>
													<FormLabel>{t("register.form.lastName")}</FormLabel>
													<FormControl>
														<Input
															placeholder={t("register.placeholders.lastName")}
															{...field}
														/>
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
													<FormLabel>{t("register.form.email")}</FormLabel>
													<FormControl>
														<Input
															placeholder={t("register.placeholders.email")}
															{...field}
														/>
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
													<FormLabel>{t("register.form.password")}</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder={t("register.placeholders.password")}
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
													<FormLabel>
														{t("register.form.confirmPassword")}
													</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder={t("register.placeholders.password")}
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
											{t("register.button")}
										</Button>
									</div>
								</form>
							</Form>
							<div className="flex flex-row justify-between flex-wrap">
								{isCloud && (
									<div className="mt-4 text-center text-sm flex gap-2 text-muted-foreground">
										{t("register.alreadyHaveAccount")}
										<Link className="underline" href="/">
											{t("auth.signIn")}
										</Link>
									</div>
								)}

								<div className="mt-4 text-center text-sm flex flex-row justify-center gap-2  text-muted-foreground">
									{t("register.needHelp")}
									<Link
										className="underline"
										href="https://dokploy.com"
										target="_blank"
									>
										{t("register.contactUs")}
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
