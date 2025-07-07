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
import { type TFunction, useTranslation } from "next-i18next";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createPasswordSchema = (t: TFunction) =>
	z.object({
		password: z.string().min(8, {
			message: t("settings.twoFactor.passwordRequired"),
		}),
		issuer: z.string().optional(),
	});

const createPinSchema = (t: TFunction) =>
	z.object({
		pin: z.string().min(6, {
			message: t("settings.twoFactor.pinRequired"),
		}),
	});

type TwoFactorSetupData = {
	qrCodeUrl: string;
	secret: string;
	totpURI: string;
};

type PasswordForm = z.infer<ReturnType<typeof createPasswordSchema>>;
type PinForm = z.infer<ReturnType<typeof createPinSchema>>;

export const Enable2FA = () => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const [data, setData] = useState<TwoFactorSetupData | null>(null);
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [step, setStep] = useState<"password" | "verify">("password");
	const [isPasswordLoading, setIsPasswordLoading] = useState(false);
	const [otpValue, setOtpValue] = useState("");

	const handleVerifySubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const result = await authClient.twoFactor.verifyTotp({
				code: otpValue,
			});

			if (result.error) {
				if (result.error.code === "INVALID_TWO_FACTOR_AUTHENTICATION") {
					toast.error(t("settings.twoFactor.invalidVerificationCode"));
					return;
				}

				throw result.error;
			}

			if (!result.data) {
				throw new Error("No response received from server");
			}

			toast.success(t("settings.twoFactor.configuredSuccessfully"));
			utils.user.get.invalidate();
			setIsDialogOpen(false);
		} catch (error) {
			if (error instanceof Error) {
				const errorMessage =
					error.message === "Failed to fetch"
						? t("settings.twoFactor.connectionError")
						: error.message;

				toast.error(errorMessage);
			} else {
				toast.error(t("settings.twoFactor.errorVerifyingCode"), {
					description: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	};

	const passwordForm = useForm<PasswordForm>({
		resolver: zodResolver(createPasswordSchema(t)),
		defaultValues: {
			password: "",
		},
	});

	const pinForm = useForm<PinForm>({
		resolver: zodResolver(createPinSchema(t)),
		defaultValues: {
			pin: "",
		},
	});

	useEffect(() => {
		if (!isDialogOpen) {
			setStep("password");
			setData(null);
			setBackupCodes([]);
			setOtpValue("");
			passwordForm.reset({
				password: "",
				issuer: "",
			});
		}
	}, [isDialogOpen, passwordForm]);

	useEffect(() => {
		if (step === "verify") {
			setOtpValue("");
		}
	}, [step]);

	const handlePasswordSubmit = async (formData: PasswordForm) => {
		setIsPasswordLoading(true);
		try {
			const { data: enableData, error } = await authClient.twoFactor.enable({
				password: formData.password,
				issuer: formData.issuer,
			});

			if (!enableData) {
				throw new Error(
					error?.message || t("settings.twoFactor.errorSettingUp"),
				);
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
				toast.success(t("settings.twoFactor.scanQrCodeSuccess"));
			} else {
				throw new Error(t("settings.twoFactor.noTotpUriReceived"));
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("settings.twoFactor.errorSettingUp"),
			);
			passwordForm.setError("password", {
				message:
					error instanceof Error
						? error.message
						: t("settings.twoFactor.errorSettingUp"),
			});
		} finally {
			setIsPasswordLoading(false);
		}
	};

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost">
					<Fingerprint className="size-4 text-muted-foreground" />
					{t("settings.twoFactor.enable")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("settings.twoFactor.setup")}</DialogTitle>
					<DialogDescription>
						{step === "password"
							? t("settings.twoFactor.setupPasswordDescription")
							: t("settings.twoFactor.setupVerifyDescription")}
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
										<FormLabel>{t("settings.twoFactor.password")}</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder={t(
													"settings.twoFactor.passwordPlaceholder",
												)}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.twoFactor.passwordDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={passwordForm.control}
								name="issuer"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.twoFactor.issuer")}</FormLabel>
										<FormControl>
											<Input
												type="text"
												placeholder={t("settings.twoFactor.issuerPlaceholder")}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.twoFactor.issuerDescription")}
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
								{t("settings.twoFactor.continue")}
							</Button>
						</form>
					</Form>
				) : (
					<Form {...pinForm}>
						<form onSubmit={handleVerifySubmit} className="space-y-6">
							<div className="flex flex-col gap-6 justify-center items-center">
								{data?.qrCodeUrl ? (
									<>
										<div className="flex flex-col items-center gap-4 p-6 border rounded-lg">
											<QrCode className="size-5 text-muted-foreground" />
											<span className="text-sm font-medium">
												{t("settings.twoFactor.scanQrCode")}
											</span>
											<img
												src={data.qrCodeUrl}
												alt="2FA QR Code"
												className="rounded-lg w-48 h-48"
											/>
											<div className="flex flex-col gap-2 text-center">
												<span className="text-sm text-muted-foreground">
													{t("settings.twoFactor.cantScanQrCode")}
												</span>
												<span className="text-xs font-mono bg-muted p-2 rounded">
													{data.secret}
												</span>
											</div>
										</div>

										{backupCodes && backupCodes.length > 0 && (
											<div className="w-full space-y-3 border rounded-lg p-4">
												<h4 className="font-medium">
													{t("settings.twoFactor.backupCodes")}
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
													{t("settings.twoFactor.backupCodesDescription")}
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

							<div className="flex flex-col justify-center items-center">
								<FormLabel>
									{t("settings.twoFactor.verificationCode")}
								</FormLabel>
								<InputOTP
									maxLength={6}
									value={otpValue}
									onChange={setOtpValue}
									autoComplete="off"
								>
									<InputOTPGroup>
										<InputOTPSlot index={0} />
										<InputOTPSlot index={1} />
										<InputOTPSlot index={2} />
										<InputOTPSlot index={3} />
										<InputOTPSlot index={4} />
										<InputOTPSlot index={5} />
									</InputOTPGroup>
								</InputOTP>
								<FormDescription>
									{t("settings.twoFactor.verificationCodeDescription")}
								</FormDescription>
							</div>

							<Button
								type="submit"
								className="w-full"
								isLoading={isPasswordLoading}
								disabled={otpValue.length !== 6}
							>
								{t("settings.twoFactor.enable")}
							</Button>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
};
