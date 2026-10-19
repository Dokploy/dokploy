import { useRouter } from "next/router";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export default function McpConsentPage() {
	const router = useRouter();
	const [organizations, setOrganizations] = useState<
		Array<{ id: string; name: string }>
	>([]);
	const [organizationId, setOrganizationId] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const postLogin = typeof router.query.ba_pl !== "string";
	const clientId =
		typeof router.query.client_id === "string"
			? router.query.client_id
			: "MCP client";
	const requestedScopes =
		typeof router.query.scope === "string"
			? router.query.scope.split(" ").filter(Boolean)
			: [];

	useEffect(() => {
		void authClient.organization.list().then(({ data }) => {
			const available = (data ?? []).map(({ id, name }) => ({ id, name }));
			setOrganizations(available);
			void authClient.getSession().then(({ data: session }) => {
				setOrganizationId(
					session?.session.activeOrganizationId ?? available[0]?.id ?? "",
				);
			});
		});
	}, []);

	const continueAuthorization = async (
		event: FormEvent<HTMLFormElement>,
		accept?: boolean,
	) => {
		event.preventDefault();
		if (!organizationId || submitting) return;
		setSubmitting(true);
		try {
			const selected = await authClient.organization.setActive({
				organizationId,
			});
			if (selected.error) throw selected.error;
			const oauthQuery = new URLSearchParams(window.location.search).toString();
			const response = await fetch(
				`/api/auth/oauth2/${postLogin ? "continue" : "consent"}`,
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(
						postLogin
							? { postLogin: true, oauth_query: oauthQuery }
							: { accept, oauth_query: oauthQuery },
					),
				},
			);
			const result = (await response.json()) as {
				redirect_uri?: string;
				message?: string;
			};
			if (!response.ok || !result.redirect_uri)
				throw new Error(result.message ?? "Authorization could not continue");
			window.location.assign(result.redirect_uri);
		} catch (error) {
			console.error("MCP authorization failed", error);
			setSubmitting(false);
		}
	};

	return (
		<main className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-lg">
				<CardHeader>
					<CardTitle>
						{postLogin ? "Choose an organization" : "Authorize MCP access"}
					</CardTitle>
					<CardDescription>
						{postLogin
							? "Choose which organization this MCP client may access."
							: "Review the access request before allowing this client to act with your Dokploy account."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					<div>
						<label className="text-sm font-medium" htmlFor="mcp-organization">
							Organization
						</label>
						<select
							id="mcp-organization"
							value={organizationId}
							onChange={(event) => setOrganizationId(event.target.value)}
							className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
						>
							{organizations.map((organization) => (
								<option key={organization.id} value={organization.id}>
									{organization.name}
								</option>
							))}
						</select>
					</div>
					{!postLogin && (
						<>
							<div>
								<p className="text-sm font-medium">Client</p>
								<p className="break-all text-sm text-muted-foreground">
									{clientId}
								</p>
							</div>
							<div>
								<p className="text-sm font-medium">Requested access</p>
								<p className="text-sm text-muted-foreground">
									{requestedScopes.length
										? requestedScopes.join(", ")
										: "Dokploy account access"}
								</p>
								<p className="mt-2 text-sm text-muted-foreground">
									Actions are limited by your current organization membership
									and Dokploy permissions.
								</p>
							</div>
						</>
					)}
					<form
						onSubmit={(event) => continueAuthorization(event, true)}
						className="flex flex-wrap justify-end gap-2"
					>
						{!postLogin && (
							<Button
								type="button"
								variant="outline"
								disabled={submitting}
								onClick={(event) =>
									void continueAuthorization(
										event as unknown as FormEvent<HTMLFormElement>,
										false,
									)
								}
							>
								Deny
							</Button>
						)}
						<Button type="submit" disabled={!organizationId || submitting}>
							{postLogin ? "Continue" : "Authorize"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
