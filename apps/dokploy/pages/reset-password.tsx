import { IS_CLOUD } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
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

const createLoginSchema = (t: (key: string) => string) =>
	z
		.object({
			password: z
				.string()
				.min(1, {
					message: t("auth.validation.passwordRequired"),
				})
				.min(8, {
					message: t("auth.validation.passwordMinLength"),
				}),
			confirmPassword: z
				.string()
				.min(1, {
					message: t("auth.validation.passwordRequired"),
				})
				.min(8, {
					message: t("auth.validation.passwordMinLength"),
				}),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: t("auth.validation.passwordsDoNotMatch"),
			path: ["confirmPassword"],
		});

type Login = z.infer<ReturnType<typeof createLoginSchema>>;

interface Props {
	tokenResetPassword: string;
}
export default function Home({ tokenResetPassword }: Props) {
	const [token, setToken] = useState<string | null>(tokenResetPassword);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const { t } = useTranslation("common");
	const form = useForm<Login>({
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
		resolver: zodResolver(createLoginSchema(t)),
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
			setError(error.message || t("auth.reset.error.generic"));
		} else {
			toast.success(t("auth.reset.toast.passwordSuccess"));
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
					{t("auth.reset.title")}
				</CardTitle>
				<CardDescription>
					{t("auth.reset.password.subtitle")}
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
										isLoading={isLoading}
										className="w-full"
									>
										{t("button.confirm")}
									</Button>
								</div>

								<div className="text-center text-sm flex gap-2 text-muted-foreground">
									<Link href="/">{t("auth.signInTitle")}</Link>
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

	const locale = getLocale((context.req as any).cookies ?? {});

	return {
		props: {
			tokenResetPassword: token,
			...(await serverSideTranslations(locale)),
		},
	};
}
