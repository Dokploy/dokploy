import { getUserByToken, IS_CLOUD } from "@dokploy/server";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useEffect, useMemo } from "react";
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
import { useWhitelabelingPublic } from "@/utils/hooks/use-whitelabeling";

type InvitationForm = {
	name: string;
	lastName: string;
	email: string;
	password: string;
	confirmPassword: string;
};

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
	const t = useTranslations();
	const router = useRouter();
	const { config: whitelabeling } = useWhitelabelingPublic();
	const { data } = api.user.getUserByToken.useQuery(
		{
			token,
		},
		{
			enabled: !!token,
			initialData: invitation,
		},
	);

	const registerSchema = useMemo(
		() =>
			z
				.object({
					name: z.string().min(1, {
						message: t("invitation.validation.firstNameRequired"),
					}),
					lastName: z.string().min(1, {
						message: t("invitation.validation.lastNameRequired"),
					}),
					email: z
						.string()
						.min(1, {
							message: t("invitation.validation.emailRequired"),
						})
						.email({
							message: t("invitation.validation.emailInvalid"),
						}),
					password: z
						.string()
						.min(1, {
							message: t("invitation.validation.passwordRequired"),
						})
						.refine((password) => password === "" || password.length >= 8, {
							message: t("invitation.validation.passwordMin"),
						}),
					confirmPassword: z
						.string()
						.min(1, {
							message: t("invitation.validation.confirmPasswordRequired"),
						})
						.refine(
							(confirmPassword) =>
								confirmPassword === "" || confirmPassword.length >= 8,
							{
								message: t("invitation.validation.confirmPasswordMin"),
							},
						),
				})
				.refine((data) => data.password === data.confirmPassword, {
					message: t("invitation.validation.passwordsDoNotMatch"),
					path: ["confirmPassword"],
				}),
		[t],
	);

	const form = useForm<InvitationForm>({
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
		if (data?.email) {
			form.reset({
				email: data?.email || "",
				password: "",
				confirmPassword: "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (values: InvitationForm) => {
		try {
			const { error } = await authClient.signUp.email({
				email: values.email,
				password: values.password,
				name: values.name,
				lastName: values.lastName,
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

			toast.success(t("invitation.successToast"));
			router.push("/dashboard/projects");
		} catch {
			toast.error(t("invitation.genericErrorToast"));
		}
	};

	return (
		<div>
			<div className="flex  h-screen w-full items-center justify-center ">
				<div className="flex flex-col items-center gap-4 w-full">
					<CardTitle className="text-2xl font-bold flex items-center gap-2">
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
						{t("invitation.title")}
					</CardTitle>
					{userAlreadyExists ? (
						<div className="flex flex-col gap-4 justify-center items-center">
							<AlertBlock type="success">
								<div className="flex flex-col gap-2">
									<span className="font-medium">
										{t("invitation.alert.validTitle")}
									</span>
									<span className="text-sm text-green-600 dark:text-green-400">
										{t("invitation.alert.message")}
									</span>
								</div>
							</AlertBlock>

							<Button asChild variant="default" className="w-full">
								<Link href="/">{t("invitation.alert.signInButton")}</Link>
							</Button>
						</div>
					) : (
						<>
							<CardDescription>{t("invitation.description")}</CardDescription>
							<div className="w-full">
								<div className="p-3" />

								{/* {isError && (
									<div className="mx-5 my-2 flex flex-row items-center gap-2 rounded-lg bg-red-50 p-2 dark:bg-red-950">
										<AlertTriangle className="text-red-600 dark:text-red-400" />
										<span className="text-sm text-red-600 dark:text-red-400">
											{error?.message}
										</span>
									</div>
								)} */}

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
																{t("invitation.form.firstName")}
															</FormLabel>
															<FormControl>
																<Input
																	placeholder={t(
																		"invitation.placeholders.firstName",
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
													name="lastName"
													render={({ field }) => (
														<FormItem>
															<FormLabel>
																{t("invitation.form.lastName")}
															</FormLabel>
															<FormControl>
																<Input
																	placeholder={t(
																		"invitation.placeholders.lastName",
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
													name="email"
													render={({ field }) => (
														<FormItem>
															<FormLabel>
																{t("invitation.form.email")}
															</FormLabel>
															<FormControl>
																<Input
																	disabled
																	placeholder={t(
																		"invitation.placeholders.email",
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
													name="password"
													render={({ field }) => (
														<FormItem>
															<FormLabel>
																{t("invitation.form.password")}
															</FormLabel>
															<FormControl>
																<Input
																	type="password"
																	placeholder={t(
																		"invitation.placeholders.password",
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
																{t("invitation.form.confirmPassword")}
															</FormLabel>
															<FormControl>
																<Input
																	type="password"
																	placeholder={t(
																		"invitation.placeholders.confirmPassword",
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
													isLoading={form.formState.isSubmitting}
													className="w-full"
												>
													{t("invitation.button")}
												</Button>
											</div>

											<div className="mt-4 text-sm flex flex-row justify-between gap-2 w-full">
												{isCloud && (
													<>
														<Link
															className="hover:underline text-muted-foreground"
															href="/"
														>
															{t("invitation.nav.login")}
														</Link>
														<Link
															className="hover:underline text-muted-foreground"
															href="/send-reset-password"
														>
															{t("auth.links.lostPassword")}
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
