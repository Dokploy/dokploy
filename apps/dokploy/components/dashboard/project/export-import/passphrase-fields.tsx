import { Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateRandomPassword } from "@/lib/password-utils";

export const MIN_PASSPHRASE_LENGTH = 12;

interface PassphraseFieldProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	errorMessage?: string;
	copyable?: boolean;
	action?: React.ReactNode;
}

export const PassphraseField = ({
	id,
	label,
	value,
	onChange,
	errorMessage,
	copyable,
	action,
}: PassphraseFieldProps) => (
	<div className="grid gap-2">
		<div className="flex items-center justify-between">
			<Label htmlFor={id}>{label}</Label>
			{action}
		</div>
		<Input
			id={id}
			type="password"
			autoComplete="new-password"
			data-1p-ignore
			data-lpignore="true"
			enableCopyButton={copyable}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			errorMessage={errorMessage}
		/>
	</div>
);

interface PassphraseFieldsProps {
	value: string;
	confirm: string;
	onValueChange: (value: string) => void;
	onConfirmChange: (value: string) => void;
}

export const isPassphraseValid = (value: string, confirm: string) =>
	value.length >= MIN_PASSPHRASE_LENGTH && value === confirm;

export const PassphraseFields = ({
	value,
	confirm,
	onValueChange,
	onConfirmChange,
}: PassphraseFieldsProps) => {
	const { t } = useTranslation();
	return (
		<>
			<AutofillDecoy />
			<PassphraseField
				id="passphrase"
				label={t("project.passphrase.labelWithMin", {
					min: MIN_PASSPHRASE_LENGTH,
				})}
				value={value}
				onChange={onValueChange}
				copyable
				errorMessage={
					value.length > 0 && value.length < MIN_PASSPHRASE_LENGTH
						? t("project.passphrase.tooShort", { min: MIN_PASSPHRASE_LENGTH })
						: undefined
				}
				action={
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-auto gap-1 px-2 py-1 text-xs"
						onClick={() => {
							const generated = generateRandomPassword(24);
							onValueChange(generated);
							onConfirmChange(generated);
						}}
					>
						<Wand2 className="size-3" />
						{t("project.passphrase.generate")}
					</Button>
				}
			/>
			<PassphraseField
				id="passphrase-confirm"
				label={t("project.passphrase.confirm")}
				value={confirm}
				onChange={onConfirmChange}
				errorMessage={
					confirm.length > 0 && confirm !== value
						? t("project.passphrase.mismatch")
						: undefined
				}
			/>
		</>
	);
};

export const AutofillDecoy = () => (
	<input
		type="text"
		name="username"
		autoComplete="username"
		tabIndex={-1}
		aria-hidden="true"
		readOnly
		className="sr-only"
	/>
);
