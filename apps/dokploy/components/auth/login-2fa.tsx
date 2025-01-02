import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";

import { CardTitle } from "@/components/ui/card";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const Login2FASchema = z.object({
	pin: z.string().min(6, {
		message: "Pin is required",
	}),
});

type Login2FA = z.infer<typeof Login2FASchema>;

interface Props {
	authId: string;
}

export const Login2FA = ({ authId }: Props) => {
	const { push } = useRouter();

	const { mutateAsync, isLoading, isError, error } =
		api.auth.verifyLogin2FA.useMutation();

	const form = useForm<Login2FA>({
		defaultValues: {
			pin: "",
		},
		resolver: zodResolver(Login2FASchema),
	});

	useEffect(() => {
		form.reset({
			pin: "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: Login2FA) => {
		await mutateAsync({
			pin: data.pin,
			id: authId,
		})
			.then(() => {
				toast.success("Signin successfully", {
					duration: 2000,
				});

				push("/dashboard/projects");
			})
			.catch(() => {
				toast.error("Signin failed", {
					duration: 2000,
				});
			});
	};
	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="grid w-full gap-4"
			>
				{isError && (
					<div className="flex flex-row gap-4 rounded-lg items-center bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{error?.message}
						</span>
					</div>
				)}
				<CardTitle className="text-xl font-bold">2FA Login</CardTitle>

				<FormField
					control={form.control}
					name="pin"
					render={({ field }) => (
						<FormItem className="flex flex-col justify-center max-sm:items-center">
							<FormLabel>Pin</FormLabel>
							<FormControl>
								<div className="flex justify-center">
									<InputOTP
										maxLength={6}
										{...field}
										pattern={REGEXP_ONLY_DIGITS}
									>
										<InputOTPGroup>
											<InputOTPSlot index={0} className="border-border" />
											<InputOTPSlot index={1} className="border-border" />
											<InputOTPSlot index={2} className="border-border" />
											<InputOTPSlot index={3} className="border-border" />
											<InputOTPSlot index={4} className="border-border" />
											<InputOTPSlot index={5} className="border-border" />
										</InputOTPGroup>
									</InputOTP>
								</div>
							</FormControl>
							<FormDescription>
								Please enter the 6 digits code provided by your authenticator
								app.
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Button isLoading={isLoading} type="submit">
					Submit 2FA
				</Button>
			</form>
		</Form>
	);
};
