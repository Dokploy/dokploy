import { Login2FA } from "@/components/auth/login-2fa";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { api } from "@/utils/api";
import { IS_CLOUD } from "@dokploy/server";
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
			message: "Email is required",
		})
		.email({
			message: "Email must be a valid email",
		}),
});

type Login = z.infer<typeof loginSchema>;

type AuthResponse = {
	is2FAEnabled: boolean;
	authId: string;
};

export default function Home() {
	const [temp, setTemp] = useState<AuthResponse>({
		is2FAEnabled: false,
		authId: "",
	});
	const { mutateAsync, isLoading, isError, error } =
		api.auth.sendResetPasswordEmail.useMutation();
	const router = useRouter();
	const form = useForm<Login>({
		defaultValues: {
			email: "",
		},
		resolver: zodResolver(loginSchema),
	});

	useEffect(() => {
		form.reset();
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (values: Login) => {
		await mutateAsync({
			email: values.email,
		})
			.then((data) => {
				toast.success("Email sent", {
					duration: 2000,
				});
			})
			.catch(() => {
				toast.error("Error sending email", {
					duration: 2000,
				});
			});
	};
	return (
		<div className="flex  h-screen w-full items-center justify-center ">
			<div className="flex flex-col items-center gap-4 w-full">
				<Link href="/" className="flex flex-row items-center gap-2">
					<Logo />
					<span className="font-medium text-sm">Dokploy</span>
				</Link>
				<CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
				<CardDescription>
					Enter your email to reset your password
				</CardDescription>

				<Card className="mx-auto w-full max-w-lg bg-transparent ">
					<div className="p-3.5" />
					<CardContent>
						{isError && (
							<AlertBlock type="error" className="my-2">
								{error?.message}
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
													<FormLabel>Email</FormLabel>
													<FormControl>
														<Input placeholder="Email" {...field} />
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
											Send Reset Link
										</Button>
									</div>
								</form>
							</Form>
						) : (
							<Login2FA authId={temp.authId} />
						)}

						<div className="flex flex-row justify-between flex-wrap">
							<div className="mt-4 text-center text-sm flex flex-row justify-center gap-2">
								<Link
									className="hover:underline text-muted-foreground"
									href="/"
								>
									Login
								</Link>
							</div>
						</div>
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
	if (!IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		props: {},
	};
}
