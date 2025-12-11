import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import { CopyIcon, DownloadIcon, Fingerprint, QrCode } from "lucide-react";
import { useTranslation } from "next-i18next";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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

const createPasswordSchema = (t: (key: string) => string) =>
	z.object({
		password: z.string().min(8, {
			message: t("auth.validation.passwordRequired"),
		}),
		issuer: z.string().optional(),
	});

const createPinSchema = (t: (key: string) => string) =>
	z.object({
		pin: z.string().min(6, {
			message: t("auth.toast.twoFactorInvalidCode"),
		}),
	});

type TwoFactorSetupData = {
	qrCodeUrl: string;
	secret: string;
	totpURI: string;
};

type PasswordForm = z.infer<ReturnType<typeof createPasswordSchema>>;

type PinForm = z.infer<ReturnType<typeof createPinSchema>>;

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
	const utils = api.useUtils();
	const [data, setData] = useState<TwoFactorSetupData | null>(null);
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [step, setStep] = useState<"password" | "verify">("password");
	const [isPasswordLoading, setIsPasswordLoading] = useState(false);
	const [otpValue, setOtpValue] = useState("");
	const { data: currentUser } = api.user.get.useQuery();
	const { t } = useTranslation(["settings", "common"]);
	const passwordSchema = useMemo(() => createPasswordSchema(t), [t]);
	const pinSchema = useMemo(() => createPinSchema(t), [t]);

	const handleVerifySubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const result = await authClient.twoFactor.verifyTotp({
				code: otpValue,
			});

			if (result.error) {
				if (result.error.code === "INVALID_TWO_FACTOR_AUTHENTICATION") {
					toast.error(
																t("settings.profile.twoFactor.enable.toast.invalidCode"),
					);
					return;
				}

				throw result.error;
			}

			if (!result.data) {
				throw new Error(t("settings.profile.twoFactor.enable.error.verify"));
			}

			toast.success(t("settings.profile.twoFactor.enable.toast.configured"));
			utils.user.get.invalidate();
			setIsDialogOpen(false);
		} catch (error) {
			if (error instanceof Error) {
				const errorMessage =
					error.message === "Failed to fetch"
						? t("settings.profile.twoFactor.enable.error.connection")
						: error.message;

				toast.error(errorMessage);
			} else {
				toast.error(t("settings.profile.twoFactor.enable.error.verify"), {
					description: t("settings.profile.twoFactor.enable.error.unknown"),
				});
			}
		}
	};

	const passwordForm = useForm<PasswordForm>({
		resolver: zodResolver(passwordSchema),
		defaultValues: {
			password: "",
		},
	});

	const pinForm = useForm<PinForm>({
		resolver: zodResolver(pinSchema),
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
					error?.message || t("settings.profile.twoFactor.enable.error.enable")
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
				toast.success(t("settings.profile.twoFactor.enable.verify.scanToast"));
			} else {
				throw new Error(t("settings.profile.twoFactor.enable.error.setup"));
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("settings.profile.twoFactor.enable.error.setup")
			);
			passwordForm.setError("password", {
				message:
					error instanceof Error
						? error.message
						: t("settings.profile.twoFactor.enable.error.setup"),
			});
		} finally {
			setIsPasswordLoading(false);
		}
	};

	const handleDownloadBackupCodes = () => {
		if (!backupCodes || backupCodes.length === 0) {
			toast.error(t("settings.profile.twoFactor.enable.toast.noBackupCodes"));
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
		toast.success(t("settings.profile.twoFactor.enable.toast.copied"));
	};

	return (
		<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost">
					<Fingerprint className="size-4 text-muted-foreground" />
					{t("settings.profile.twoFactor.enable.button")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{t("settings.profile.twoFactor.enable.dialog.title")}
					</DialogTitle>
					<DialogDescription>
						{step === "password"
							? t("settings.profile.twoFactor.enable.dialog.descriptionPassword")
							: t("settings.profile.twoFactor.enable.dialog.descriptionVerify")}
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
											{t("settings.profile.twoFactor.enable.password.label")}
										</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder={t("settings.profile.twoFactor.enable.password.placeholder")}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.profile.twoFactor.enable.password.description")}
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
										<FormLabel>
											{t("settings.profile.twoFactor.enable.issuer.label")}
										</FormLabel>
										<FormControl>
											<Input
												type="text"
												placeholder={t("settings.profile.twoFactor.enable.issuer.placeholder")}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.profile.twoFactor.enable.issuer.description")}
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
								{t("settings.profile.twoFactor.enable.password.submit")}
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
												{t("settings.profile.twoFactor.enable.verify.scanTitle")}
											</span>
											{/** biome-ignore lint/performance/noImgElement: This is a valid use case for an img element */}
											<img
												src={data.qrCodeUrl}
												alt={t("settings.profile.twoFactor.enable.verify.qrAlt")}
												className="rounded-lg w-48 h-48"
											/>
											<div className="flex flex-col gap-2 text-center">
												<span className="text-sm text-muted-foreground">
													{t("settings.profile.twoFactor.enable.verify.cantScan")}
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
														{t("settings.profile.twoFactor.enable.backup.title")}
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
																	<p>
																		{t("settings.profile.twoFactor.enable.backup.copy")}
																	</p>
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
																	<p>
																		{t("settings.profile.twoFactor.enable.backup.download")}
																	</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													</div>
												</div>
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
													{t("settings.profile.twoFactor.enable.backup.description")}
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
									{t("settings.profile.twoFactor.enable.verify.codeLabel")}
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
									{t("settings.profile.twoFactor.enable.verify.codeDescription")}
								</FormDescription>
							</div>

							<Button
								type="submit"
								className="w-full"
								isLoading={isPasswordLoading}
								disabled={otpValue.length !== 6}
							>
								{t("settings.profile.twoFactor.enable.verify.submit")}
							</Button>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
};
