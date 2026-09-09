import type { CompletionSource } from "@codemirror/autocomplete";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { useFormContext } from "react-hook-form";
import { CodeEditor } from "@/components/shared/code-editor";
import { VaultImportDialog } from "@/components/shared/vault-import-dialog";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Toggle } from "@/components/ui/toggle";

interface Props {
	name: string;
	title: string;
	description: ReactNode;
	placeholder: string;
	completionSource?: CompletionSource;
	projectId?: string;
	environmentId?: string;
}

export const Secrets = (props: Props) => {
	const [isVisible, setIsVisible] = useState(true);
	const form = useFormContext<Record<string, string>>();

	return (
		<>
			<CardHeader className="flex flex-row w-full items-center justify-between px-0">
				<div>
					<CardTitle className="text-xl">{props.title}</CardTitle>
					<CardDescription>{props.description}</CardDescription>
				</div>

				<div className="flex items-center gap-2">
					<VaultImportDialog
						projectId={props.projectId}
						environmentId={props.environmentId}
						currentEnv={form.watch(props.name) ?? ""}
						onImport={(next) =>
							form.setValue(props.name, next, { shouldDirty: true })
						}
					/>
					<Toggle
						aria-label="Toggle bold"
						pressed={isVisible}
						onPressedChange={setIsVisible}
					>
						{isVisible ? (
							<EyeOffIcon className="h-4 w-4 text-muted-foreground" />
						) : (
							<EyeIcon className="h-4 w-4 text-muted-foreground" />
						)}
					</Toggle>
				</div>
			</CardHeader>
			<CardContent className="w-full space-y-4 p-0">
				<FormField
					control={form.control}
					name={props.name}
					render={({ field }) => (
						<FormItem className="w-full">
							<FormControl>
								<CodeEditor
									style={
										{
											WebkitTextSecurity: isVisible ? "disc" : null,
										} as CSSProperties
									}
									language="properties"
									completionSource={props.completionSource}
									disabled={isVisible}
									lineWrapping
									placeholder={props.placeholder}
									className="h-96 font-mono"
									{...field}
								/>
							</FormControl>

							<FormMessage />
						</FormItem>
					)}
				/>
			</CardContent>
		</>
	);
};
