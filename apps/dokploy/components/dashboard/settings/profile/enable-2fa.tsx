import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { CopyIcon, DownloadIcon, Fingerprint, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
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
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

const PasswordSchema = z.object({
	password: z.string().min(8, {
		message: "settings.profile.passwordRequired",
	}),
	issuer: z.string().optional(),
});

const PinSchema = z.object({
	pin: z.string().min(6, {
		message: "settings.profile.pinRequired",
	}),
});

type TwoFactorSetupData = {
	qrCodeUrl: string;
	secret: string;
	totpURI: string;
};

type PasswordForm = z.infer<typeof PasswordSchema>;
type PinForm = z.infer<typeof PinSchema>;

export const USERNAME_PLACEHOLDER = "%username%";
export const DATE_PLACEHOLDER = "%date%";
export const BACKUP_CODES_PLACEHOLDER = "%backupCodes%";

export const backupCodeTemplate = `Dokploy - BACKUP VERIFICATION CODES

Points to note
--------------
# Each code can be used only once.
# Do not share these codes with anyone.

Generated codes
---------------
Username: ${USERNAME_PLACEHOLDER}
Generated on: ${DATE_PLACEHOLDER}


${BACKUP_CODES_PLACEHOLDER}
`;

export const Enable2FA = () => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [data, setData] = useState<TwoFactorSetupData | null>(null);
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [step, setStep] = useState<"password" | "verify">("password");
	const [isPasswordLoading, setIsPasswordLoading] = useState(false);
	const [otpValue, setOtpValue] = useState("");
	const { data: currentUser } = api.user.get.useQuery();

	const handleVerifySubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const result = await authClient.twoFactor.verifyTotp({
				code: otpValue,
			});

			if (result.error) {
				if (result.error.code === "INVALID_CODE") {
					toast.error(t("settings.profile.invalidCode"));
					return;
				}

				throw result.error;
			}

			if (!result.data) {
				throw new Error(t("settings.profile.noServerResponse"));
			}

			toast.success(t("settings.profile.twoFAConfigured"));
			utils.user.get.invalidate();
			setIsDialogOpen(false);
		} catch (error) {
			if (error instanceof Error) {
				const errorMessage =
					error.message === "Failed to fetch"
						? t("settings.profile.connectionError")
						: error.message;

				toast.error(errorMessage);
			} else {
				toast.error(t("settings.profile.verificationError"), {
					description:
						error instanceof Error
							? error.message
							: t("settings.profile.unknownError"),
				});
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
				throw new Error(error?.message || t("settings.profile.enableError"));
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
				toast.success(t("settings.profile.scanQrToast"));
			} else {
				throw new Error(t("settings.profile.noTotpUri"));
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("settings.profile.setupError"),
			);
			passwordForm.setError("password", {
				message:
					error instanceof Error
						? error.message
						: t("settings.profile.setupError"),
			});
		} finally {
			setIsPasswordLoading(false);
		}
	};

	const handleDownloadBackupCodes = () => {
		if (!backupCodes || backupCodes.length === 0) {
			toast.error(t("settings.profile.noBackupCodes"));
			return;
		}

		const backupCodesFormatted = backupCodes
			.map((code, index) => ` ${index + 1}. ${code}`)
			.join("\n");

		const date = new Date();
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const filename = `dokploy-2fa-backup-codes-${year}${month}${day}.txt`;

		const backupCodesText = backupCodeTemplate
			.replace(USERNAME_PLACEHOLDER, currentUser?.user?.email || "unknown")
			.replace(DATE_PLACEHOLDER, date.toLocaleString())
			.replace(BACKUP_CODES_PLACEHOLDER, backupCodesFormatted);

		const blob = new Blob([backupCodesText], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const handleCopyBackupCodes = () => {
		const date = new Date();

		const backupCodesFormatted = backupCodes
			.map((code, index) => ` ${index + 1}. ${code}`)
			.join("\n");

		const backupCodesText = backupCodeTemplate
			.replace(USERNAME_PLACEHOLDER, currentUser?.user?.email || "unknown")
			.replace(DATE_PLACEHOLDER, date.toLocaleString())
			.replace(BACKUP_CODES_PLACEHOLDER, backupCodesFormatted);

		copy(backupCodesText);
		toast.success(t("settings.profile.backupCodesCopied"));
	};

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost">
					<Fingerprint className="size-4 text-muted-foreground" />
					{t("settings.profile.enable2FA")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("settings.profile.twoFASetup")}</DialogTitle>
					<DialogDescription>
						{step === "password"
							? t("settings.profile.setupPasswordStep")
							: t("settings.profile.setupScanStep")}
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
										<FormLabel>{t("settings.profile.password")}</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder={t("settings.profile.enterPassword")}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.profile.enterPasswordToEnable")}
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
										<FormLabel>{t("settings.profile.issuer")}</FormLabel>
										<FormControl>
											<Input
												type="text"
												placeholder={t("settings.profile.issuerPlaceholder")}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.profile.issuerDescription")}
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
								{t("settings.profile.continue")}
							</Button>
						</form>
					</Form>
				) : (
					<Form {...pinForm}>
						<form onSubmit={handleVerifySubmit} className="space-y-6">
							{/* ph-no-capture keeps the TOTP secret, QR code and backup codes out of session replay. */}
							<div className="ph-no-capture flex flex-col gap-6 justify-center items-center">
								{data?.qrCodeUrl ? (
									<>
										<div className="flex flex-col items-center gap-4 p-6 border rounded-lg">
											<QrCode className="size-5 text-muted-foreground" />
											<span className="text-sm font-medium">
												{t("settings.profile.scanQr")}
											</span>
											{/** biome-ignore lint/performance/noImgElement: This is a valid use case for an img element */}
											<img
												src={data.qrCodeUrl}
												alt={t("settings.profile.qrCodeAlt")}
												className="rounded-lg w-48 h-48"
											/>
											<div className="flex flex-col gap-2 text-center">
												<span className="text-sm text-muted-foreground">
													{t("settings.profile.cantScan")}
												</span>
												<span className="text-xs font-mono bg-muted p-2 rounded">
													{data.secret}
												</span>
											</div>
										</div>

										{backupCodes && backupCodes.length > 0 && (
											<div className="w-full space-y-3 border rounded-lg p-4">
												<div className="flex items-center justify-between">
													<h4 className="font-medium">
														{t("settings.profile.backupCodes")}
													</h4>
													<div className="flex items-center gap-2">
														<TooltipProvider>
															<Tooltip delayDuration={0}>
																<TooltipTrigger asChild>
																	<Button
																		type="button"
																		variant="outline"
																		size="icon"
																		onClick={handleCopyBackupCodes}
																	>
																		<CopyIcon className="size-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>
																	<p>{t("settings.profile.copy")}</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>

														<TooltipProvider>
															<Tooltip delayDuration={0}>
																<TooltipTrigger asChild>
																	<Button
																		type="button"
																		variant="outline"
																		size="icon"
																		onClick={handleDownloadBackupCodes}
																	>
																		<DownloadIcon className="size-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>
																	<p>{t("settings.profile.download")}</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													</div>
												</div>
												<div className="grid grid-cols-2 gap-2">
													{backupCodes.map((code, index) => (
														<code
															key={`${code}-${index}`}
															className="bg-muted p-2 rounded text-sm font-mono"
														>
															{code}
														</code>
													))}
												</div>
												<p className="text-sm text-muted-foreground">
													{t("settings.profile.backupCodesNoteShort")}
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

							<div className="flex flex-col gap-2">
								<FormLabel>{t("settings.profile.verificationCode")}</FormLabel>
								<InputOTP
									maxLength={6}
									value={otpValue}
									onChange={setOtpValue}
									autoFocus
								>
									<InputOTPGroup>
										<InputOTPSlot index={0} />
										<InputOTPSlot index={1} />
										<InputOTPSlot index={2} />
									</InputOTPGroup>
									<InputOTPSeparator />
									<InputOTPGroup>
										<InputOTPSlot index={3} />
										<InputOTPSlot index={4} />
										<InputOTPSlot index={5} />
									</InputOTPGroup>
								</InputOTP>
								<FormDescription>
									{t("settings.profile.verificationCodeDescription")}
								</FormDescription>
							</div>

							<Button
								type="submit"
								className="w-full"
								isLoading={isPasswordLoading}
								disabled={otpValue.length !== 6}
							>
								{t("settings.profile.enable2FA")}
							</Button>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
};
