import { createFileRoute } from "@tanstack/react-router";
import { ShowVaultProviders } from "@/components/dashboard/settings/vault/show-vault-providers";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowVaultProviders />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/secrets")({
	component: Page,
});
