import { AlertBlock } from "@/components/shared/alert-block";
import {
	getComposeFileMountExample,
	getComposeFileMountSource,
} from "@/lib/compose-file-mount";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
	fileName?: string;
}

export const ComposeFileMountHint = ({ composeId, fileName }: Props) => {
	const { data: compose } = api.compose.one.useQuery(
		{ composeId },
		{ enabled: !!composeId },
	);

	if (!compose) return null;

	const name = fileName?.trim() || "<file-name>";
	const source = getComposeFileMountSource({
		composeType: compose.composeType,
		composePath: compose.composePath,
		sourceType: compose.sourceType,
		fileName: name,
	});

	return (
		<AlertBlock type="info">
			<div className="flex flex-col gap-2">
				<p>
					This file is stored outside your repository. Reference it from your
					compose file using this path:
				</p>
				<code className="w-fit rounded bg-muted px-2 py-1 text-foreground">
					{source}
				</code>
				<p>Example:</p>
				<pre className="rounded bg-muted px-2 py-1 text-foreground whitespace-pre-wrap break-all">
					{getComposeFileMountExample(source)}
				</pre>
			</div>
		</AlertBlock>
	);
};
