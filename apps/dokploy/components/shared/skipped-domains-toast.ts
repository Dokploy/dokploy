import { toast } from "sonner";

export const warnSkippedDomains = (skippedDomains: string[]) => {
	if (skippedDomains.length === 0) return;
	toast.warning("Some template domains were not created", {
		description:
			"Your role does not allow them. Add a domain from the allowed list in the Domains tab.",
	});
};
