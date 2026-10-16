import { Eye, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateRandomPassword } from "@/lib/password-utils";
import { api } from "@/utils/api";
import { CollapsibleSection } from "./collapsible-section";

const KIND_LABELS = {
	basicAuth: "Basic auth",
	registry: "Registry",
	destination: "Destination",
	sshKey: "SSH key",
	certificate: "Certificate",
} as const;

interface SecretsReviewProps {
	importId: string;
	overrides: Record<string, string>;
	onChange: (secretId: string, value: string | undefined) => void;
}

export const SecretsReview = ({
	importId,
	overrides,
	onChange,
}: SecretsReviewProps) => {
	const [revealed, setRevealed] = useState<Record<string, string>>({});
	const { data: secrets } = api.projectExportImport.importSecrets.useQuery({
		importId,
	});
	const { mutateAsync: reveal } =
		api.projectExportImport.importSecretReveal.useMutation({
			onError: (error) => toast.error(error.message),
		});

	if (!secrets || secrets.length === 0) return null;

	const handleReveal = async (secretId: string) => {
		try {
			const { value } = await reveal({ importId, secretId });
			setRevealed((prev) => ({ ...prev, [secretId]: value }));
		} catch {}
	};

	return (
		<CollapsibleSection
			className="border-t pt-4"
			title={`Review secrets (${secrets.length})`}
		>
			<p className="text-xs text-muted-foreground">
				These credentials belong to systems outside Dokploy and are imported as
				they were exported. Reveal one to check it, or replace it before
				importing.
			</p>
			{secrets.map((secret) => {
				const override = overrides[secret.secretId];
				return (
					<div
						key={secret.secretId}
						className="grid gap-2 rounded-md border p-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
					>
						<div className="min-w-0">
							<span className="text-muted-foreground">
								{KIND_LABELS[secret.kind]}{" "}
							</span>
							<span className="font-medium">{secret.resource}</span>
							<span className="text-muted-foreground"> · {secret.field}</span>
						</div>
						<Input
							className="h-8 font-mono text-xs"
							type={
								override !== undefined || revealed[secret.secretId]
									? "text"
									: "password"
							}
							value={override ?? revealed[secret.secretId] ?? ""}
							placeholder="••••••••••••"
							onChange={(e) => onChange(secret.secretId, e.target.value)}
						/>
						<div className="flex gap-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-8 px-2"
								onClick={() => handleReveal(secret.secretId)}
								title="Reveal"
							>
								<Eye className="h-3.5 w-3.5" />
							</Button>
							{secret.generatable && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 px-2"
									onClick={() =>
										onChange(secret.secretId, generateRandomPassword(20))
									}
									title="Generate a new value"
								>
									<RefreshCcw className="h-3.5 w-3.5" />
								</Button>
							)}
							{override !== undefined && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 px-2"
									onClick={() => onChange(secret.secretId, undefined)}
								>
									Reset
								</Button>
							)}
						</div>
					</div>
				);
			})}
		</CollapsibleSection>
	);
};
