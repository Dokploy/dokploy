import { IS_CLOUD, isAdminPresent, validateRequest } from "@dokploy/server";
import {
	STRONG_PASSWORD_MESSAGE,
	STRONG_PASSWORD_REGEX,
} from "@dokploy/server/utils/password-validation";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { AlertTriangle, ServerIcon } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { SignInWithGithub } from "@/components/proprietary/auth/sign-in-with-github";
import { SignInWithGoogle } from "@/components/proprietary/auth/sign-in-with-google";
import { SignupShowcase } from "@/components/proprietary/auth/signup-showcase";
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
import { pushToDataLayer } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { appRouter } from "@/server/api/root";
import { generateServerSideHelper } from "@/utils/create-server-helpers";
import { useWhitelabelingPublic } from "@/utils/hooks/use-whitelabeling";

const registerSchema = z
	.object({
		name: z.string().min(1, {
			message: "auth.errors.firstNameRequired",
		}),
		lastName: z.string().min(1, {
			message: "auth.errors.lastNameRequired",
		}),
		email: z
			.string()
			.trim()
			.min(1, {
				message: "auth.errors.emailRequired",
			})
			.email({
				message: "auth.errors.emailInvalid",
			}),
		password: z
			.string()
			.min(1, {
				message: "auth.errors.passwordRequired",
			})
			.regex(STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE),
		confirmPassword: z
			.string()
			.min(1, {
				message: "auth.errors.passwordRequired",
			})
			.refine(
				(confirmPassword) =>
					confirmPassword === "" || confirmPassword.length >= 8,
				{
					message: "auth.errors.passwordMin",
				},
			),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "auth.errors.passwordsMismatch",
		path: ["confirmPassword"],
	});

type Register = z.infer<typeof registerSchema>;

interface Props {
	hasAdmin: boolean;
	isCloud: boolean;
}

const Register = ({ isCloud }: Props) => {
	const router = useRouter();
	const { t } = useTranslation();
	const { config: whitelabeling } = useWhitelabelingPublic();
	const [isError, setIsError] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [data, setData] = useState<any>(null);

	const form = useForm<Register>({
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

	const onSubmit = async (values: Register) => {
		const { data, error } = await authClient.signUp.email({
			email: values.email,
			password: values.password,
			name: values.name,
			lastName: values.lastName,
		});

		if (error) {
			setIsError(true);
			setError(error.message || t("auth.errors.generic"));
		} else {
			toast.success(t("auth.success.userRegistered"), {
				duration: 2000,
			});
			if (!isCloud) {
				router.push("/");
			} else {
				pushToDataLayer("sign_up", { method: "email" });
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
								logoLightUrl={
									whitelabeling?.loginLogoLightUrl ||
									whitelabeling?.logoLightUrl ||
									undefined
								}
							/>
						</Link>
						{isCloud
							? t("auth.register.cloudTitle")
							: t("auth.register.setupTitle")}
					</CardTitle>
					<CardDescription className="text-center">
						{isCloud
							? t("auth.register.cloudSubtitle")
							: t("auth.register.setupSubtitle")}
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
								<span>{t("auth.register.registeredSuccessfully")}</span>
							</AlertBlock>
						)}
						<CardContent className="p-0">
							{isCloud && (
								<div className="mb-4 flex gap-3 rounded-lg border bg-muted/40 px-4 py-3.5">
									<ServerIcon
										className="mt-0.5 size-4 shrink-0 text-muted-foreground"
										aria-hidden
									/>
									<p className="text-sm text-muted-foreground">
										{t("auth.register.serverHint")}
									</p>
								</div>
							)}
							{isCloud && (
								<div className="flex flex-col gap-2">
									<SignInWithGithub />
									<SignInWithGoogle />
								</div>
							)}
							{isCloud && (
								<p className="mb-4 text-center text-xs text-muted-foreground">
									{t("auth.register.orRegisterWithEmail")}
								</p>
							)}
							<Form {...form}>
								<form
									method="post"
									onSubmit={form.handleSubmit(onSubmit)}
									className="grid gap-4"
								>
									<div className="space-y-4">
										<FormField
											control={form.control}
											name="name"
											render={({ field }) => (
												<FormItem>
													<FormLabel>{t("auth.register.firstName")}</FormLabel>
													<FormControl>
														<Input placeholder="John" {...field} />
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
													<FormLabel>{t("auth.register.lastName")}</FormLabel>
													<FormControl>
														<Input placeholder="Doe" {...field} />
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
													<FormLabel>{t("common.email")}</FormLabel>
													<FormControl>
														<Input placeholder="email@dokploy.com" {...field} />
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
													<FormLabel>{t("common.password")}</FormLabel>
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
													<FormLabel>
														{t("auth.register.confirmPassword")}
													</FormLabel>
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

										<Button
											type="submit"
											isLoading={form.formState.isSubmitting}
											className="w-full"
										>
											{isCloud
												? t("auth.register.createAccount")
												: t("auth.register.register")}
										</Button>
									</div>
								</form>
							</Form>
							{isCloud && (
								<p className="mt-4 text-center text-sm text-muted-foreground">
									{t("auth.register.trialHint")}
								</p>
							)}
							<div className="flex flex-row justify-between flex-wrap">
								{isCloud && (
									<div className="mt-4 text-center text-sm flex gap-2 text-muted-foreground">
										{t("auth.register.alreadyHaveAccount")}
										<Link className="underline" href="/">
											{t("auth.register.signIn")}
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
	const isCloud = (page.props as Props).isCloud;
	return (
		<OnboardingLayout leftPanel={isCloud ? <SignupShowcase /> : undefined}>
			{page}
		</OnboardingLayout>
	);
};
export async function getServerSideProps(context: GetServerSidePropsContext) {
	const helpers = generateServerSideHelper(appRouter, context);
	// Prefetch the public branding so the onboarding logo and app name render
	// correctly on the server (no flash of default branding).
	await helpers.whitelabeling.getPublic.prefetch();

	if (IS_CLOUD) {
		const { user } = await validateRequest(context.req);

		if (user) {
			return {
				redirect: {
					permanent: false,
					destination: "/dashboard/home",
				},
			};
		}
		return {
			props: {
				trpcState: helpers.dehydrate(),
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
			trpcState: helpers.dehydrate(),
			isCloud: false,
		},
	};
}
