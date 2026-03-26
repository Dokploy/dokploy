import { useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface TBankWidgetTestButtonProps {
	plan: "pro" | "agency";
	disabled: boolean;
	onCreateCheckout: (plan: "pro" | "agency") => Promise<{ paymentUrl: string }>;
}

export const TBankWidgetTestButton = ({
	plan,
	disabled,
	onCreateCheckout,
}: TBankWidgetTestButtonProps) => {
	const t = useTranslations("billing");
	const [isLoading, setIsLoading] = useState(false);

	const handleOpenWidget = async () => {
		try {
			setIsLoading(true);
			const result = await onCreateCheckout(plan);

			if (!result.paymentUrl) {
				toast.error(t("checkoutStartError"));
				return;
			}

			window.open(result.paymentUrl, "_blank", "noopener,noreferrer");
		} catch {
			toast.error(t("checkoutStartError"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Button
			variant="secondary"
			disabled={disabled || isLoading}
			isLoading={isLoading}
			onClick={handleOpenWidget}
		>
			{t("testWithTbankWidget")}
		</Button>
	);
};

