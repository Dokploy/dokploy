import { getUserByToken, IS_CLOUD } from "@dokploy/server";
import { zodResolver } from "@hookform/resolvers/zod";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { type ReactElement, useEffect } from "react";
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
import { api } from "@/utils/api";
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
	token: string;
	invitation: Awaited<ReturnType<typeof getUserByToken>>;
	isCloud: boolean;
	userAlreadyExists: boolean;
}

const Invitation = ({
	token,
	invitation,
	isCloud,
	userAlreadyExists,
}: Props) => {
	const { t } = useTranslation("common");
	const router = useRouter();
	const { data } = api.user.getUserByToken.useQuery(
		{
			token,
		},
		{
			enabled: !!token,
			initialData: invitation,
		},
	);

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
		if (data?.email) {
			form.reset({
				email: data?.email || "",
				password: "",
				confirmPassword: "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (values: Register) => {
		try {
			const { error } = await authClient.signUp.email({
				email: values.email,
				password: values.password,
				name: values.name,
				fetchOptions: {
					headers: {
						"x-dokploy-token": token,
					},
				},
			});

			if (error) {
				toast.error(error.message);
				return;
			}

			const _result = await authClient.organization.acceptInvitation({
				invitationId: token,
			});

			toast.success(t("auth.register.toast.success"));
			router.push("/dashboard/projects");
		} catch {
			toast.error(t("auth.register.error.generic"));
		}
	};

	return (
		<div>
			<div className="flex  h-screen w-full items-center justify-center ">
				<div className="flex flex-col items-center gap-4 w-full">
					<CardTitle className="text-2xl font-bold flex items-center gap-2">
						<Link
							href="https://dokploy.com"
							target="_blank"
							className="flex flex-row items-center gap-2"
						>
							<Logo className="size-12" />
						</Link>
						{t("invitations.page.title")}
					</CardTitle>
					{userAlreadyExists ? (
						<div className="flex flex-col gap-4 justify-center items-center">
							<AlertBlock type="success">
								<div className="flex flex-col gap-2">
									<span className="font-medium">
										{t("invitations.valid.title")}
									</span>
									<span className="text-sm text-green-600 dark:text-green-400">
										{t("invitations.valid.description")}
									</span>
								</div>
							</AlertBlock>

							<Button asChild variant="default" className="w-full">
								<Link href="/">{t("auth.signInTitle")}</Link>
							</Button>
						</div>
					) : (
						<>
							<CardDescription>
								{t("invitations.form.description")}
							</CardDescription>
							<div className="w-full">
								<div className="p-3" />

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
															<FormLabel>
																{t("auth.nameLabel")}
															</FormLabel>
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
															<FormLabel>
																{t("auth.emailLabel")}
															</FormLabel>
															<FormControl>
																<Input
																	disabled
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
															<FormLabel>
																{t("auth.passwordLabel")}
															</FormLabel>
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
															<FormLabel>
																{t("auth.confirmPasswordLabel")}
															</FormLabel>
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

											<div className="mt-4 text-sm flex flex-row justify-between gap-2 w-full">
												{isCloud && (
													<>
														<Link
															className="hover:underline text-muted-foreground"
															href="/"
														>
															{t("auth.loginButton")}
														</Link>
														<Link
															className="hover:underline text-muted-foreground"
															href="/send-reset-password"
														>
															{t("auth.footer.lostPassword")}
														</Link>
													</>
												)}
											</div>
										</form>
									</Form>
								</CardContent>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
};
// http://localhost:3000/invitation?token=CZK4BLrUdMa32RVkAdZiLsPDdvnPiAgZ
// /f7af93acc1a99eae864972ab4c92fee089f0d83473d415ede8e821e5dbabe79c
export default Invitation;
Invitation.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};
export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { query } = ctx;

	const token = query.token;

	// if (IS_CLOUD) {
	// 	return {
	// 		redirect: {
	// 			permanent: true,
	// 			destination: "/",
	// 		},
	// 	};
	// }

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

		if (invitation.userAlreadyExists) {
			return {
				props: {
					isCloud: IS_CLOUD,
					token: token,
					invitation: invitation,
					userAlreadyExists: true,
				},
			};
		}

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
		console.log("error", error);
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
}
