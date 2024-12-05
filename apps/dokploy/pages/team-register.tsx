import { AlertBlock } from "@/components/shared/alert-block";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
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
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// Reuse the same schema from register.tsx
const registerSchema = z
	.object({
		email: z
			.string()
			.min(1, {
				message: "Email is required",
			})
			.email({
				message: "Email must be a valid email",
			}),
		password: z
			.string()
			.min(1, {
				message: "Password is required",
			})
			.refine((password) => password === "" || password.length >= 8, {
				message: "Password must be at least 8 characters",
			}),
		confirmPassword: z
			.string()
			.min(1, {
				message: "Password is required",
			})
			.refine(
				(confirmPassword) =>
					confirmPassword === "" || confirmPassword.length >= 8,
				{
					message: "Password must be at least 8 characters",
				},
			),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

type Register = z.infer<typeof registerSchema>;

const TeamRegister = () => {
	const router = useRouter();
	const { token } = router.query;

	// Validate invitation token
	const { data: invitation } = api.team.invitations.validateToken.useQuery(
		{ token: token as string },
		{ enabled: !!token },
	);

	const { mutateAsync, error, isError, data } =
		api.team.teamUsers.createTeamUser.useMutation();

	const form = useForm<Register>({
		defaultValues: {
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
		await mutateAsync({
			email: values.email.toLowerCase(),
			password: values.password,
			invitationToken: token as string,
		})
			.then(() => {
				toast.success("Account created successfully!");
				router.push("/dashboard/projects");
			})
			.catch((error) => {
				toast.error(error.message);
			});
	};

	if (!invitation) {
		return (
			<div className="flex h-screen items-center justify-center">
				<Card className="w-[400px]">
					<CardContent className="p-6">
						<AlertBlock type="error">
							Invalid or expired invitation link
						</AlertBlock>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div>
			<div className="flex h-screen w-full items-center justify-center">
				<div className="flex flex-col items-center gap-4 w-full">
					<Link
						href="https://dokploy.com"
						target="_blank"
						className="flex flex-row items-center gap-2"
					>
						<Logo />
						<span className="font-medium text-sm">Dokploy</span>
					</Link>

					<CardTitle className="text-2xl font-bold">
						Join {invitation.teamName}
					</CardTitle>
					<CardDescription>
						Create your account to join the team
					</CardDescription>
					<Card className="mx-auto w-full max-w-lg bg-transparent">
						<div className="p-3" />
						{isError && (
							<div className="mx-5 my-2 flex flex-row items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
								<AlertTriangle className="h-5 w-5 text-destructive" />
								<div className="flex flex-col gap-1">
									<p className="text-sm font-medium text-destructive">
										{error?.message || "Failed to create account"}
									</p>
									{error?.message?.includes("already exists") && (
										<p className="text-xs text-destructive/80">
											You can{" "}
											<Link href="/" className="underline">
												sign in here
											</Link>{" "}
											if you already have an account.
										</p>
									)}
								</div>
							</div>
						)}
						<CardContent>
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
													<FormLabel>Password</FormLabel>
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
													<FormLabel>Confirm Password</FormLabel>
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
											Create Account & Join Team
										</Button>
									</div>
								</form>
							</Form>
							<div className="mt-4 text-center text-sm flex flex-row justify-center gap-2">
								Need help?
								<Link
									className="underline"
									href="https://dokploy.com"
									target="_blank"
								>
									Contact us
								</Link>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
};

export default TeamRegister;
