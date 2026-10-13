import {
	type Completion,
	type CompletionContext,
	type CompletionResult,
	startCompletion,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { useCallback } from "react";
import { api } from "@/utils/api";

interface Options {
	projectEnv?: string | null;
	environmentEnv?: string | null;
	includeShared?: boolean;
	projectId?: string;
	environmentId?: string;
}

const parseKeys = (env?: string | null) =>
	(env ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#") && line.includes("="))
		.map((line) => line.slice(0, line.indexOf("=")).trim())
		.filter((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key));

const applyAndContinue = (
	view: EditorView,
	completion: Completion,
	from: number,
	to: number,
) => {
	view.dispatch({
		changes: { from, to, insert: completion.label },
		selection: { anchor: from + completion.label.length },
	});
	startCompletion(view);
};

const applyAndClose = (
	view: EditorView,
	completion: Completion,
	from: number,
	to: number,
) => {
	const alreadyClosed = view.state.sliceDoc(to, to + 2) === "}}";
	const insert = completion.label + (alreadyClosed ? "" : "}}");
	view.dispatch({
		changes: { from, to, insert },
		selection: {
			anchor: from + completion.label.length + 2,
		},
	});
};

export const useEnvCompletionSource = ({
	projectEnv,
	environmentEnv,
	includeShared = true,
	projectId,
	environmentId,
}: Options = {}) => {
	const { data: allProviders } = api.vaultProvider.all.useQuery();
	const utils = api.useUtils();
	const providers = projectId
		? allProviders?.filter((provider) =>
				provider.assignments?.some(
					(assignment) =>
						assignment.projectId === projectId &&
						(assignment.environmentIds.length === 0 ||
							!environmentId ||
							assignment.environmentIds.includes(environmentId)),
				),
			)
		: [];

	return useCallback(
		async (context: CompletionContext): Promise<CompletionResult | null> => {
			const match = context.matchBefore(/\$\{\{[^}\n]*$/);
			if (!match) return null;

			const inner = match.text.slice(3);
			const innerFrom = match.from + 3;

			const vaultSecret = /^vault\.([a-zA-Z0-9_-]+)\.([^}\n]*)$/.exec(inner);
			if (vaultSecret) {
				const provider = providers?.find((p) => p.name === vaultSecret[1]);
				if (!provider || !projectId) return null;
				const names = await utils.vaultProvider.listSecretNames
					.fetch({
						vaultProviderId: provider.vaultProviderId,
						projectId,
						environmentId,
					})
					.catch(() => [] as string[]);
				return {
					from: innerFrom + `vault.${vaultSecret[1]}.`.length,
					options: names.map((name) => ({
						label: name,
						type: "variable",
						apply: applyAndClose,
					})),
					validFor: /^[^}\n]*$/,
				};
			}

			const vaultProviderPrefix = /^vault\.([a-zA-Z0-9_-]*)$/.exec(inner);
			if (vaultProviderPrefix) {
				return {
					from: innerFrom + "vault.".length,
					options: (providers ?? []).map((provider) => ({
						label: `${provider.name}.`,
						detail: provider.providerType,
						type: "namespace",
						apply: applyAndContinue,
					})),
					validFor: /^[a-zA-Z0-9_-]*$/,
				};
			}

			if (includeShared) {
				const shared: [RegExp, string, string | null | undefined][] = [
					[/^project\.([^}\n]*)$/, "project.", projectEnv],
					[/^environment\.([^}\n]*)$/, "environment.", environmentEnv],
				];
				for (const [regex, prefix, env] of shared) {
					if (regex.test(inner)) {
						return {
							from: innerFrom + prefix.length,
							options: parseKeys(env).map((key) => ({
								label: key,
								type: "variable",
								apply: applyAndClose,
							})),
							validFor: /^[A-Za-z0-9_]*$/,
						};
					}
				}
			}

			if (!inner.includes(".")) {
				const options: Completion[] = [];
				if (includeShared) {
					options.push(
						{
							label: "project.",
							type: "namespace",
							info: "Shared project variables",
							apply: applyAndContinue,
						},
						{
							label: "environment.",
							type: "namespace",
							info: "Shared environment variables",
							apply: applyAndContinue,
						},
					);
				}
				options.push({
					label: "vault.",
					type: "namespace",
					info: "Secrets from an external vault provider",
					apply: applyAndContinue,
				});
				if (includeShared) {
					for (const key of parseKeys(context.state.doc.toString())) {
						options.push({
							label: key,
							type: "variable",
							apply: applyAndClose,
						});
					}
				}
				return {
					from: innerFrom,
					options,
					validFor: /^[A-Za-z0-9_.-]*$/,
				};
			}

			return null;
		},
		[
			providers,
			projectEnv,
			environmentEnv,
			includeShared,
			projectId,
			environmentId,
			utils,
		],
	);
};
