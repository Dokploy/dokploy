import { createFileRoute } from "@tanstack/react-router";
import { AiForm } from "@/components/dashboard/settings/ai-form";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<AiForm />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/ai")({
	component: Page,
});
