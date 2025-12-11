import { IS_CLOUD, isAdminPresent, validateRequest } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
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
import { getLocale, serverSideTranslations } from "@/utils/i18n";

const createRegisterSchema = (t: (key: string) => string) =>
	z
		.object({
			name: z.string().min(1, {
				message: t("auth.validation.nameRequired"),
			}),
			email: z
				.string()
				.min(1, {
					message: t("auth.validation.emailRequired"),
				})
				.email({
					message: t("auth.validation.emailInvalid"),
				}),
			password: z
				.string()
				.min(1, {
					message: t("auth.validation.passwordRequired"),
				})
				.refine((password) => password === "" || password.length >= 8, {
					message: t("auth.validation.passwordMinLength"),
				}),
			confirmPassword: z
				.string()
				.min(1, {
					message: t("auth.validation.passwordRequired"),
				})
				.refine(
					(confirmPassword) =>
						confirmPassword === "" || confirmPassword.length >= 8,
					{
						message: t("auth.validation.passwordMinLength"),
					},
				),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: t("auth.validation.passwordsDoNotMatch"),
			path: ["confirmPassword"],
		});

type Register = z.infer<ReturnType<typeof createRegisterSchema>>;

interface Props {
	hasAdmin: boolean;
	isCloud: boolean;
}

const Register = ({ isCloud }: Props) => {
	const router = useRouter();
	const { t } = useTranslation("common");
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
		resolver: zodResolver(createRegisterSchema(t)),
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
			setError(error.message || t("auth.register.error.generic"));
		} else {
			toast.success(t("auth.register.toast.success"), {
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
						{isCloud
							? t("auth.register.title.cloud")
							: t("auth.register.title.selfHosted")}
					</CardTitle>
					<CardDescription>
						{isCloud
							? t("auth.register.subtitle.cloud")
							: t("auth.register.subtitle.selfHosted")}
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
								<span>{t("auth.register.success.verifyEmail")}</span>
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
													<FormLabel>{t("auth.nameLabel")}</FormLabel>
													<FormControl>
														<Input
															placeholder={t("auth.namePlaceholder")}
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
													<FormLabel>{t("auth.emailLabel")}</FormLabel>
													<FormControl>
														<Input
															placeholder={t("auth.emailPlaceholder")}
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
													<FormLabel>{t("auth.passwordLabel")}</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder={t("auth.passwordPlaceholder")}
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
													<FormLabel>{t("auth.confirmPasswordLabel")}</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder={t("auth.confirmPasswordPlaceholder")}
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
											{t("auth.register.button")}
										</Button>
									</div>
								</form>
							</Form>
							<div className="flex flex-row justify-between flex-wrap">
								{isCloud && (
									<div className="mt-4 text-center text-sm flex gap-2 text-muted-foreground">
										{t("auth.register.alreadyAccount")}
										<Link className="underline" href="/">
											{t("auth.signInTitle")}
										</Link>
									</div>
								)}

								<div className="mt-4 text-center text-sm flex flex-row justify-center gap-2  text-muted-foreground">
									{t("auth.register.needHelp")}
									<Link
										className="underline"
										href="https://dokploy.com"
										target="_blank"
									>
										{t("auth.register.contactUs")}
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
	const locale = getLocale((context.req as any).cookies ?? {});

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
				...(await serverSideTranslations(locale)),
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
			...(await serverSideTranslations(locale)),
		},
	};
}
