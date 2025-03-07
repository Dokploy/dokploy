import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Input } from "@/components/ui/input";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Fingerprint, QrCode } from "lucide-react";
import { useTranslation } from "next-i18next";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const PasswordSchema = z.object({
	password: z.string().min(8, {
		message: "Password is required",
	}),
});

const PinSchema = z.object({
	pin: z.string().min(6, {
		message: "Pin is required",
	}),
});

type TwoFactorSetupData = {
	qrCodeUrl: string;
	secret: string;
	totpURI: string;
};

type PasswordForm = z.infer<typeof PasswordSchema>;
type PinForm = z.infer<typeof PinSchema>;

export const Enable2FA = () => {
	const utils = api.useUtils();
	const { t } = useTranslation("settings");
	const [data, setData] = useState<TwoFactorSetupData | null>(null);
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [step, setStep] = useState<"password" | "verify">("password");
	const [isPasswordLoading, setIsPasswordLoading] = useState(false);

	const handlePasswordSubmit = async (formData: PasswordForm) => {
		setIsPasswordLoading(true);
		try {
			const { data: enableData } = await authClient.twoFactor.enable({
				password: formData.password,
			});

			if (!enableData) {
				throw new Error("No data received from server");
			}

			if (enableData.backupCodes) {
				setBackupCodes(enableData.backupCodes);
			}

			if (enableData.totpURI) {
				const qrCodeUrl = await QRCode.toDataURL(enableData.totpURI);

				setData({
					qrCodeUrl,
					secret: enableData.totpURI.split("secret=")[1]?.split("&")[0] || "",
					totpURI: enableData.totpURI,
				});

				setStep("verify");
				toast.success(t("settings.2fa.scanQrCode"));
			} else {
				throw new Error("No TOTP URI received from server");
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("settings.2fa.errorSettingUp")
			);
			passwordForm.setError("password", {
				message: t("settings.2fa.errorVerifyingPassword"),
			});
		} finally {
			setIsPasswordLoading(false);
		}
	};

	const handleVerifySubmit = async (formData: PinForm) => {
		try {
			const result = await authClient.twoFactor.verifyTotp({
				code: formData.pin,
			});

			if (result.error) {
				if (result.error.code === "INVALID_TWO_FACTOR_AUTHENTICATION") {
					pinForm.setError("pin", {
						message: t("settings.2fa.invalidCode"),
					});
					toast.error(t("settings.2fa.invalidVerificationCode"));
					return;
				}

				throw result.error;
			}

			if (!result.data) {
				throw new Error("No response received from server");
			}

			toast.success(t("settings.2fa.success"));
			utils.user.get.invalidate();
			setIsDialogOpen(false);
		} catch (error) {
			if (error instanceof Error) {
				const errorMessage =
					error.message === "Failed to fetch"
						? t("settings.2fa.connectionError")
						: error.message;

				pinForm.setError("pin", {
					message: errorMessage,
				});
				toast.error(errorMessage);
			} else {
				pinForm.setError("pin", {
					message: t("settings.2fa.errorVerifyingCode"),
				});
				toast.error(t("settings.2fa.errorVerifying2faCode"));
			}
		}
	};

	const passwordForm = useForm<PasswordForm>({
		resolver: zodResolver(PasswordSchema),
		defaultValues: {
			password: "",
		},
	});

	const pinForm = useForm<PinForm>({
		resolver: zodResolver(PinSchema),
		defaultValues: {
			pin: "",
		},
	});

	useEffect(() => {
		if (!isDialogOpen) {
			setStep("password");
			setData(null);
			setBackupCodes([]);
			passwordForm.reset();
			pinForm.reset();
		}
	}, [isDialogOpen, passwordForm, pinForm]);

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost">
					<Fingerprint className="size-4 text-muted-foreground" />
					{t("settings.2fa.enable2fa")}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("settings.2fa.title")}</DialogTitle>
					<DialogDescription>
						{step === "password"
							? t("settings.2fa.enterPassword")
							: t("settings.2fa.scanQrCodeAndVerify")}
					</DialogDescription>
				</DialogHeader>

				{step === "password" ? (
					<Form {...passwordForm}>
						<form
							id="password-form"
							onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
							className="space-y-4"
						>
							<FormField
								control={passwordForm.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.2fa.password")}
										</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder={t("settings.2fa.enterPasswordPlaceholder")}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.2fa.enterPasswordDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="submit"
								className="w-full"
								isLoading={isPasswordLoading}
							>
								{t("settings.2fa.continue")}
							</Button>
						</form>
					</Form>
				) : (
					<Form {...pinForm}>
						<form
							id="pin-form"
							onSubmit={pinForm.handleSubmit(handleVerifySubmit)}
							className="space-y-6"
						>
							<div className="flex flex-col gap-6 justify-center items-center">
								{data?.qrCodeUrl ? (
									<>
										<div className="flex flex-col items-center gap-4 p-6 border rounded-lg">
											<QrCode className="size-5 text-muted-foreground" />
											<span className="text-sm font-medium">
												{t("settings.2fa.scanQrCode")}
											</span>
											<img
												src={data.qrCodeUrl}
												alt={t("settings.2fa.qrCodeAlt")}
												className="rounded-lg w-48 h-48"
											/>
											<div className="flex flex-col gap-2 text-center">
												<span className="text-sm text-muted-foreground">
													{t("settings.2fa.cantScanQrCode")}
												</span>
												<span className="text-xs font-mono bg-muted p-2 rounded">
													{data.secret}
												</span>
											</div>
										</div>

										{backupCodes && backupCodes.length > 0 && (
											<div className="w-full space-y-3 border rounded-lg p-4">
												<h4 className="font-medium">
													{t("settings.2fa.backupCodes")}
												</h4>
												<div className="grid grid-cols-2 gap-2">
													{backupCodes.map((code, index) => (
														<code
															key={index}
															className="bg-muted p-2 rounded text-sm font-mono"
														>
															{code}
														</code>
													))}
												</div>
												<p className="text-sm text-muted-foreground">
													{t("settings.2fa.saveBackupCodes")}
												</p>
											</div>
										)}
									</>
								) : (
									<div className="flex items-center justify-center w-full h-48 bg-muted rounded-lg">
										<QrCode className="size-8 text-muted-foreground animate-pulse" />
									</div>
								)}
							</div>

							<FormField
								control={pinForm.control}
								name="pin"
								render={({ field }) => (
									<FormItem className="flex flex-col justify-center items-center">
										<FormLabel>
											{t("settings.2fa.verificationCode")}
										</FormLabel>
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
										<FormDescription>
											{t("settings.2fa.enterVerificationCode")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<Button
								type="submit"
								className="w-full"
								isLoading={isPasswordLoading}
							>
								{t("settings.2fa.enable2fa")}
							</Button>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
};
