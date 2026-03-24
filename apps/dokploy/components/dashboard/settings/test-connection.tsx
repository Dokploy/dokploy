"use client";

import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
	apiUrl: string;
	apiKey: string;
	model: string;
}

export const TestConnection = ({ apiUrl, apiKey, model }: Props) => {
	const { mutateAsync: testConnection, isPending: isTesting } =
		api.ai.testConnection.useMutation();

	const handleTest = async () => {
		if (!apiUrl) {
			toast.error("API URL is required");
			return;
		}

		try {
			const result = await testConnection({
				apiUrl,
				apiKey,
				model: model || undefined,
			});
			toast.success(result.message);
		} catch (error) {
			toast.error("Connection test failed", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<Button
			type="button"
			variant="secondary"
			onClick={handleTest}
			disabled={!apiUrl || isTesting}
			isLoading={isTesting}
		>
			{isTesting ? "Testing..." : "Test Connection"}
		</Button>
	);
};
