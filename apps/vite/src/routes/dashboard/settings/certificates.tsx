import { createFileRoute } from "@tanstack/react-router";
import { ShowCertificates } from "@/components/dashboard/settings/certificates/show-certificates";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowCertificates />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/certificates")({
	component: Page,
});
