export const DISPOSABLE_EMAIL_MESSAGE =
	"Temporary or disposable email addresses are not allowed. Please use a permanent email address.";

// Lazy so self-hosted instances never load the ~56k domain list.
let blacklist: Set<string> | undefined;

export const isDisposableEmail = async (email: string) => {
	blacklist ??= (await import("mailchecker")).default.blacklist();
	let domain = email.trim().toLowerCase().split("@").pop() ?? "";
	while (domain.includes(".")) {
		if (blacklist.has(domain)) return true;
		domain = domain.slice(domain.indexOf(".") + 1);
	}
	return false;
};
