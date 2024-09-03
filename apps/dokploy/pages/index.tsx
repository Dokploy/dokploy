import { Login2FA } from "@/components/auth/login-2fa";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
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
import i18n from "@/i18n";
import { isAdminPresent } from "@/server/api/services/admin";
import { validateRequest } from "@/server/auth/auth";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
	email: z
		.string()
		.min(1, {
			message: i18n.getText('PAGE.login.email.required'),
		})
		.email({
			message: i18n.getText('PAGE.login.email.invalid'),
		}),

	password: z
		.string()
		.min(1, {
			message: i18n.getText('PAGE.login.password.required'),
		})
		.min(8, {
			message: i18n.getText('PAGE.login.password.minLength'),
		}),
});

type Login = z.infer<typeof loginSchema>;

interface Props {
	hasAdmin: boolean;
}

type AuthResponse = {
	is2FAEnabled: boolean;
	authId: string;
};

export default function Home({ hasAdmin }: Props) {
	const [temp, setTemp] = useState<AuthResponse>({
		is2FAEnabled: false,
		authId: "",
	});
	const { mutateAsync, isLoading } = api.auth.login.useMutation();
	const router = useRouter();
	const form = useForm<Login>({
		defaultValues: {
			email: "",
			password: "",
		},
		resolver: zodResolver(loginSchema),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (values: Login) => {
		await mutateAsync({
			email: values.email,
			password: values.password,
		})
			.then((data) => {
				if (data.is2FAEnabled) {
					setTemp(data);
				} else {
					toast.success(i18n.getText('PAGE.login.success'), {
						duration: 2000,
					});
					router.push("/dashboard/projects");
				}
			})
			.catch(() => {
				toast.error(i18n.getText('PAGE.login.failure'), {
					duration: 2000,
				});
			});
	};
	return (
		<div className="flex  h-screen w-full items-center justify-center ">
			<div className="flex flex-col items-center gap-4 w-full">
				<Link
					href="https://dokploy.com"
					target="_blank"
					className="flex flex-row items-center gap-2"
				>
					<Logo />
					<span className="font-medium text-sm">
						{i18n.getText('PAGE.login.Dokploy')}
					</span>
				</Link>
				<CardTitle className="text-2xl font-bold">{i18n.getText('PAGE.login.signIn')}</CardTitle>
				<CardDescription>
					{i18n.getText('PAGE.login.enterCredentials')}
				</CardDescription>
				<Card className="mx-auto w-full max-w-lg bg-transparent ">
					<div className="p-3.5" />
					<CardContent>
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
													<FormLabel>{i18n.getText('PAGE.login.emailLabel')}</FormLabel>
													<FormControl>
														<Input placeholder={i18n.getText('PAGE.login.emailPlaceholder')} {...field} />
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
													<FormLabel>{i18n.getText('PAGE.login.passwordLabel')}</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder={i18n.getText('PAGE.login.passwordPlaceholder')}
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
											{i18n.getText('PAGE.login.loginButton')}
										</Button>
									</div>
								</form>
							</Form>
						) : (
							<Login2FA authId={temp.authId} />
						)}

						{!hasAdmin && (
							<div className="mt-4 text-center text-sm">
								{i18n.getText('PAGE.login.dontHaveAccount')}
								<Link className="underline" href="/register">
								{i18n.getText('PAGE.login.signUpLink')}
								</Link>
							</div>
						)}
						<div className="flex flex-row justify-between flex-wrap">
							<div className="mt-4 text-center text-sm flex flex-row justify-center gap-2">
								{i18n.getText('PAGE.login.needHelp')}
								<Link
									className="underline"
									href="https://dokploy.com"
									target="_blank"
								>
									{i18n.getText('PAGE.login.contactUsLink')}
								</Link>
							</div>

							<div className="mt-4 text-sm flex flex-row justify-center gap-2">
								<Link
									className="hover:underline text-muted-foreground"
									href="https://docs.dokploy.com/get-started/reset-password"
									target="_blank"
								>
									{i18n.getText('PAGE.login.lostPasswordLink')}
								</Link>
							</div>
						</div>
						<div className="p-2" />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

Home.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};
export async function getServerSideProps(context: GetServerSidePropsContext) {
	const hasAdmin = await isAdminPresent();

	if (!hasAdmin) {
		return {
			redirect: {
				permanent: true,
				destination: "/register",
			},
		};
	}

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
			hasAdmin,
		},
	};
}
