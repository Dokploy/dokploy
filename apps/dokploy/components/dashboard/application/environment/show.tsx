import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import CryptoJS from "crypto-js";
import { CodeEditor } from "@/components/shared/code-editor";
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
	FormMessage,
} from "@/components/ui/form";
import { Toggle } from "@/components/ui/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const addEnvironmentSchema = z.object({
	env: z.string(),
	buildArgs: z.string(),
});

type EnvironmentSchema = z.infer<typeof addEnvironmentSchema>;

interface Props {
	applicationId: string;
}

export const ShowEnvironment = ({ applicationId }: Props) => {
	const { mutateAsync, isLoading } =
		api.application.saveEnvironment.useMutation();
	const { mutateAsync: updateApplication, isLoading: isUpdating } =
		api.application.update.useMutation();

	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);

	const [isEnvVisible, setIsEnvVisible] = useState(true);
	const [isSecureMode, setIsSecureMode] = useState(false);
	const [originalEnv, setOriginalEnv] = useState("");

	const form = useForm<EnvironmentSchema>({
		defaultValues: {
			env: "",
			buildArgs: "",
		},
		resolver: zodResolver(addEnvironmentSchema),
	});

	// Watch form values
	const currentEnv = form.watch("env");
	const currentBuildArgs = form.watch("buildArgs");

	// Determine if there are unsaved changes
	const hasChanges = isSecureMode
		? data?.env !== originalEnv
		: currentEnv !== (data?.env || "") ||
			currentBuildArgs !== (data?.buildArgs || "");

	const SECRET_KEY = "my-secret-key";

	// Encrypt only values (right side of '=')
	const encryptEnvironmentValues = (envString: string) => {
		if (!envString) return "";
		const lines = envString.split("\n");
		return lines
			.map((line) => {
				if (!line.includes("=")) return line;
				const equalIndex = line.indexOf("=");
				const key = line.substring(0, equalIndex);
				const value = line.substring(equalIndex + 1);
				const encryptedValue = CryptoJS.AES.encrypt(
					value.trim(),
					SECRET_KEY,
				).toString();
				return `${key}=${encryptedValue}`;
			})
			.join("\n");
	};

	// Decrypt encrypted environment values
	const decryptEnvironmentValues = (envString: string) => {
		if (!envString) return "";
		const lines = envString.split("\n");
		return lines
			.map((line: string) => {
				if (!line.includes("=")) return line;
				const equalIndex = line.indexOf("=");
				const key = line.substring(0, equalIndex);
				const value = line.substring(equalIndex + 1);
				try {
					const decryptedBytes = CryptoJS.AES.decrypt(value.trim(), SECRET_KEY);
					const decryptedValue = decryptedBytes.toString(CryptoJS.enc.Utf8);
					return decryptedValue
						? `${key}=${decryptedValue}`
						: `${key}=${value.trim()}`;
				} catch (error) {
					return `${key}=${value.trim()}`;
				}
			})
			.join("\n");
	};

	useEffect(() => {
		if (data) {
			// If this is an application resource and it's secured
			if ("is_secured" in data && data.is_secured === true) {
				setIsSecureMode(true);
				setOriginalEnv(data.env || "");
				// For display, we'll show the encrypted form
				const encryptedValue = encryptEnvironmentValues(data.env || "");
				form.reset({
					env: encryptedValue,
					buildArgs: data.buildArgs || "",
				});
			} else {
				setIsSecureMode(false);
				setOriginalEnv("");
				form.reset({
					env: data.env || "",
					buildArgs: data.buildArgs || "",
				});
			}
		}
	}, [data, form]);

	const handleSecureClick = async () => {
		try {
			const currentFormValues = form.getValues("env");

			await updateApplication({
				applicationId: applicationId,
				is_secured: !isSecureMode,
			});

			setIsSecureMode(!isSecureMode);

			if (!isSecureMode) {
				// Store the current unencrypted values before enabling secure mode
				setOriginalEnv(currentFormValues);
				// Update the form with encrypted values for display only
				form.setValue("env", encryptEnvironmentValues(currentFormValues), {
					shouldDirty: false,
				});
			} else {
				// If turning off secure mode, restore the original unencrypted values
				form.setValue("env", originalEnv || "", { shouldDirty: false });
			}

			toast.success(
				`Secure mode ${!isSecureMode ? "enabled" : "disabled"} successfully`,
			);
			await refetch();
		} catch (error) {
			console.error("Error toggling secure mode:", error);
			toast.error("Failed to toggle secure mode");
		}
	};

	const onSubmit = async (formData: EnvironmentSchema) => {
		let envToSave = formData.env;
		if (isSecureMode) {
			// Always decrypt the form values if in secure mode
			envToSave = decryptEnvironmentValues(envToSave);
			// Update originalEnv with the decrypted values
			setOriginalEnv(envToSave);
		}

		// Determine if this is a secured environment from the database
		const isSecuredFromDB =
			data && "is_secured" in data && data.is_secured === true;

		try {
			await mutateAsync({
				env: envToSave,
				buildArgs: formData.buildArgs,
				applicationId,
			});

			// Also update the is_secured field
			await updateApplication({
				applicationId: applicationId,
				is_secured: isSecuredFromDB || isSecureMode,
			});

			toast.success("Environments Updated");
			// After saving, if in secure mode, update the form with encrypted values
			if (isSecureMode || isSecuredFromDB) {
				const encrypted = encryptEnvironmentValues(envToSave);
				form.setValue("env", encrypted, { shouldDirty: false });
			}
			await refetch();
		} catch (error) {
			console.error("Save error:", error);
			toast.error("Error updating environment");
		}
	};

	const handleCancel = () => {
		if (data && "is_secured" in data && data.is_secured === true) {
			// If the data was already secured, maintain that state
			const encryptedValue = encryptEnvironmentValues(data.env || "");
			form.reset({
				env: encryptedValue,
				buildArgs: data.buildArgs || "",
			});
			setIsSecureMode(true);
			setOriginalEnv(data.env || "");
		} else {
			form.reset({
				env: data?.env || "",
				buildArgs: data?.buildArgs || "",
			});
			setIsSecureMode(false);
		}
	};

	return (
		<div className="flex w-full flex-col gap-5">
			<Card className="bg-background">
				<CardHeader className="flex flex-row w-full items-center justify-between">
					<div>
						<CardTitle className="text-xl">Environment Settings</CardTitle>
						<CardDescription>
							You can add environment variables to your resource.
							{hasChanges && (
								<span className="text-yellow-500 ml-2">
									(You have unsaved changes)
								</span>
							)}
							{data && "is_secured" in data && data.is_secured === true && (
								<span className="text-green-500 ml-2">
									(Using Secured Environment)
								</span>
							)}
						</CardDescription>
					</div>

					<div className="flex items-center gap-2">
						<Toggle
							aria-label="Toggle visibility"
							pressed={isEnvVisible}
							onPressedChange={setIsEnvVisible}
						>
							{isEnvVisible ? (
								<EyeOffIcon className="h-4 w-4 text-muted-foreground" />
							) : (
								<EyeIcon className="h-4 w-4 text-muted-foreground" />
							)}
						</Toggle>

						{/* Show toggle for applications */}
						<TooltipProvider delayDuration={0}>
							<Tooltip>
								<TooltipTrigger asChild>
									<Toggle
										aria-label="Encrypt values"
										pressed={isSecureMode}
										onPressedChange={handleSecureClick}
										disabled={
											data && "is_secured" in data && data.is_secured === true
										}
									>
										{isSecureMode ? (
											<LockIcon
												className={`h-4 w-4 ${data && "is_secured" in data && data.is_secured === true ? "text-green-600" : "text-green-500"}`}
											/>
										) : (
											<UnlockIcon className="h-4 w-4 text-muted-foreground" />
										)}
									</Toggle>
								</TooltipTrigger>
								{data && "is_secured" in data && data.is_secured === true && (
									<TooltipContent>
										<p>Environment is secured and cannot be toggled off</p>
									</TooltipContent>
								)}
							</Tooltip>
						</TooltipProvider>
					</div>
				</CardHeader>

				<CardContent>
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="w-full space-y-4"
						>
							<FormField
								control={form.control}
								name="env"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<CodeEditor
												style={
													{
														WebkitTextSecurity: isEnvVisible ? "disc" : null,
													} as CSSProperties
												}
												language="properties"
												disabled={isEnvVisible}
												className={`font-mono ${isSecureMode ? "bg-green-50" : ""}`}
												wrapperClassName="compose-file-editor"
												placeholder={`NODE_ENV=production
PORT=3000`}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{data?.buildType === "dockerfile" && (
								<FormField
									control={form.control}
									name="buildArgs"
									render={({ field }) => (
										<FormItem>
											<FormControl>
												<CodeEditor
													language="properties"
													className="font-mono"
													wrapperClassName="compose-file-editor"
													placeholder="NPM_TOKEN=xyz"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							<div className="flex flex-row justify-end gap-2">
								{hasChanges && (
									<Button
										type="button"
										variant="outline"
										onClick={handleCancel}
									>
										Cancel
									</Button>
								)}
								<Button
									isLoading={isLoading || isUpdating}
									className="w-fit"
									type="submit"
									disabled={!hasChanges && !isSecureMode}
								>
									Save
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
};
