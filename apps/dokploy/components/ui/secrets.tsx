import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EnvEditor } from "@/components/ui/env-editor";
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";

interface Props {
	name: string;
	title: string;
	description: ReactNode;
	placeholder: string;
}

export const Secrets = (props: Props) => {
	const form = useFormContext<Record<string, string>>();

	return (
		<>
			<CardHeader className="flex flex-row w-full items-center justify-between px-0">
				<div>
					<CardTitle className="text-xl">{props.title}</CardTitle>
					<CardDescription>{props.description}</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="w-full space-y-4 p-0">
				<FormField
					control={form.control}
					name={props.name}
					render={({ field }) => (
						<FormItem className="w-full">
							<FormControl>
								<EnvEditor
									value={field.value ?? ""}
									onChange={field.onChange}
									placeholder={props.placeholder}
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
