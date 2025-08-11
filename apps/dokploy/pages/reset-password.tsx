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
import { IS_CLOUD } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import type { GetServerSidePropsContext } from "next";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	tokenResetPassword: string;
}

export default function Home({ tokenResetPassword }: Props) {
	const { t } = useTranslation("reset-password");
	const [token, setToken] = useState<string | null>(tokenResetPassword);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	const loginSchema = z
		.object({
			password: z
				.string()
				.min(1, {
					message: t("resetPassword.passwordRequired"),
				})
				.min(8, {
					message: t("resetPassword.passwordMinLength"),
				}),
			confirmPassword: z
				.string()
				.min(1, {
					message: t("resetPassword.passwordRequired"),
				})
				.min(8, {
					message: t("resetPassword.passwordMinLength"),
				}),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: t("resetPassword.passwordsDoNotMatch"),
			path: ["confirmPassword"],
		});

	type Login = z.infer<typeof loginSchema>;

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
			setError(error.message || t("resetPassword.errorOccurred"));
		} else {
			toast.success(t("resetPassword.passwordResetSuccessfully"));
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
					{t("resetPassword.title")}
				</CardTitle>
				<CardDescription>{t("resetPassword.subtitle")}</CardDescription>

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
												<FormLabel>{t("resetPassword.password")}</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t("resetPassword.passwordPlaceholder")}
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
													{t("resetPassword.confirmPassword")}
												</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"resetPassword.confirmPasswordPlaceholder",
														)}
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
										{t("resetPassword.confirm")}
									</Button>
								</div>

								<div className="text-center text-sm flex gap-2 text-muted-foreground">
									<Link href="/">{t("resetPassword.signIn")}</Link>
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
	const locale = getLocale(context.req.cookies);
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
			...(await serverSideTranslations(locale, ["common", "reset-password"])),
		},
	};
}
