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
	z.object({
		email: z
			.string()
			.min(1, {
				message: t("auth.validation.emailRequired"),
			})
			.email({
				message: t("auth.validation.emailInvalid"),
			}),
	});

type Login = z.infer<ReturnType<typeof createLoginSchema>>;

type AuthResponse = {
	is2FAEnabled: boolean;
	authId: string;
};

export default function Home() {
	const [temp, _setTemp] = useState<AuthResponse>({
		is2FAEnabled: false,
		authId: "",
	});

	const { t } = useTranslation("common");

	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const _router = useRouter();
	const form = useForm<Login>({
		defaultValues: {
			email: "",
		},
		resolver: zodResolver(createLoginSchema(t)),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (values: Login) => {
		setIsLoading(true);
		const { error } = await authClient.forgetPassword({
			email: values.email,
			redirectTo: "/reset-password",
		});
		if (error) {
			setError(error.message || t("auth.reset.error.generic"));
			setIsLoading(false);
		} else {
			toast.success(t("auth.reset.toast.emailSent"), {
				duration: 2000,
			});
		}
		setIsLoading(false);
	};
	return (
		<div className="flex w-full items-center justify-center ">
			<div className="flex flex-col items-center gap-4 w-full">
				<Link href="/" className="flex flex-row items-center gap-2">
					<Logo />
					<span className="font-medium text-sm">Dokploy</span>
				</Link>
				<CardTitle className="text-2xl font-bold">
					{t("auth.reset.title")}
				</CardTitle>
				<CardDescription>
					{t("auth.reset.email.subtitle")}
				</CardDescription>

				<div className="mx-auto w-full max-w-lg bg-transparent ">
					<CardContent className="p-0">
						{error && (
							<AlertBlock type="error" className="my-2">
								{error}
							</AlertBlock>
						)}
						{!temp.is2FAEnabled ? (
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

										<Button
											type="submit"
											isLoading={isLoading}
											className="w-full"
										>
											{t("auth.reset.sendLinkButton")}
										</Button>
									</div>
								</form>
							</Form>
						) : null}

						<div className="flex flex-row justify-between flex-wrap">
							<div className="mt-4 text-center text-sm flex flex-row justify-center gap-2">
								<Link
									className="hover:underline text-muted-foreground"
									href="/"
								>
									{t("auth.loginButton")}
								</Link>
							</div>
						</div>
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

	const locale = getLocale((context.req as any).cookies ?? {});

	return {
		props: {
			...(await serverSideTranslations(locale)),
		},
	};
}
