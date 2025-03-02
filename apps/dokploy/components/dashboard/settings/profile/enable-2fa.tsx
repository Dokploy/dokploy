import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Fingerprint } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const Enable2FASchema = z.object({
	pin: z.string().min(6, {
		message: "Pin is required",
	}),
});

type Enable2FA = z.infer<typeof Enable2FASchema>;

export const Enable2FA = () => {
	const utils = api.useUtils();

	const { data } = api.auth.generate2FASecret.useQuery(undefined, {
		refetchOnWindowFocus: false,
	});

	const { mutateAsync, isLoading, error, isError } =
		api.auth.verify2FASetup.useMutation();

	const form = useForm<Enable2FA>({
		defaultValues: {
			pin: "",
		},
		resolver: zodResolver(Enable2FASchema),
	});

	useEffect(() => {
		form.reset({
			pin: "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (formData: Enable2FA) => {
		await mutateAsync({
			pin: formData.pin,
			secret: data?.secret || "",
		})
			.then(async () => {
				toast.success("2FA Verified");
				utils.auth.get.invalidate();
			})
			.catch(() => {
				toast.error("Error verifying the 2FA");
			});
	};
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost">
					<Fingerprint className="size-4 text-muted-foreground" />
					Enable 2FA
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen max-sm:overflow-y-auto sm:max-w-xl ">
				<DialogHeader>
					<DialogTitle>2FA Setup</DialogTitle>
					<DialogDescription>Add a 2FA to your account</DialogDescription>
				</DialogHeader>
				{isError && (
					<div className="flex flex-row gap-4 rounded-lg items-center bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{error?.message}
						</span>
					</div>
				)}
				<Form {...form}>
					<form
						id="hook-form-add-2FA"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid sm:grid-cols-2 w-full gap-4"
					>
						<div className="flex flex-col gap-4 justify-center items-center">
							<span className="text-sm text-muted-foreground">
								{data?.qrCodeUrl ? "Scan the QR code to add 2FA" : ""}
							</span>
							<img
								src={data?.qrCodeUrl}
								alt="qrCode"
								className="rounded-lg w-fit"
							/>
							<div className="flex flex-col gap-2">
								<span className="text-sm text-muted-foreground text-center">
									{data?.secret ? `Secret: ${data?.secret}` : ""}
								</span>
							</div>
						</div>

						<FormField
							control={form.control}
							name="pin"
							render={({ field }) => (
								<FormItem className="flex flex-col justify-center max-sm:items-center">
									<FormLabel>Pin</FormLabel>
									<FormControl>
										<InputOTP maxLength={6} {...field}>
											<InputOTPGroup>
												<InputOTPSlot index={0} />
												<InputOTPSlot index={1} />
												<InputOTPSlot index={2} />
												<InputOTPSlot index={3} />
												<InputOTPSlot index={4} />
												<InputOTPSlot index={5} />
											</InputOTPGroup>
										</InputOTP>
									</FormControl>
									<FormDescription className="max-md:text-center">
										Please enter the 6 digits code provided by your
										authenticator app.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							form="hook-form-add-2FA"
							type="submit"
						>
							Submit 2FA
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
