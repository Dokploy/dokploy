import { IS_CLOUD } from "@dokploy/server";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useEffect, useMemo, useState } from "react";
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
import { useWhitelabelingPublic } from "@/utils/hooks/use-whitelabeling";

type ResetPasswordForm = {
	password: string;
	confirmPassword: string;
};

interface Props {
	tokenResetPassword: string;
}
export default function Home({ tokenResetPassword }: Props) {
	const t = useTranslations();
	const { config: whitelabeling } = useWhitelabelingPublic();
	const [token, setToken] = useState<string | null>(tokenResetPassword);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	const loginSchema = useMemo(
		() =>
			z
				.object({
					password: z
						.string()
						.min(1, {
							message: t("resetPassword.validation.passwordRequired"),
						})
						.min(8, {
							message: t("resetPassword.validation.passwordMin"),
						}),
					confirmPassword: z
						.string()
						.min(1, {
							message: t("resetPassword.validation.passwordRequired"),
						})
						.min(8, {
							message: t("resetPassword.validation.passwordMin"),
						}),
				})
				.refine((data) => data.password === data.confirmPassword, {
					message: t("resetPassword.validation.passwordsDoNotMatch"),
					path: ["confirmPassword"],
				}),
		[t],
	);

	const form = useForm<ResetPasswordForm>({
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

	const onSubmit = async (values: ResetPasswordForm) => {
		setIsLoading(true);
		const { error } = await authClient.resetPassword({
			newPassword: values.password,
			token: token || "",
		});

		if (error) {
			setError(error.message || t("resetPassword.genericError"));
		} else {
			toast.success(t("resetPassword.toastSuccess"));
			router.push("/");
		}
		setIsLoading(false);
	};
	return (
		<div className="flex  h-screen w-full items-center justify-center ">
			<div className="flex flex-col items-center gap-4 w-full">
				<CardTitle className="text-2xl font-bold flex flex-row gap-2 items-center">
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
					{t("resetPassword.title")}
				</CardTitle>
				<CardDescription>{t("resetPassword.description")}</CardDescription>

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
												<FormLabel>
													{t("resetPassword.form.passwordLabel")}
												</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"resetPassword.form.passwordPlaceholder",
														)}
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
													{t("resetPassword.form.confirmPasswordLabel")}
												</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t(
															"resetPassword.form.confirmPasswordPlaceholder",
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
										{t("resetPassword.button")}
									</Button>
								</div>

								<div className="text-center text-sm flex gap-2 text-muted-foreground">
									<Link href="/">{t("auth.signIn")}</Link>
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
