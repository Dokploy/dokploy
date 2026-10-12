import { Plus, Trash2 } from "lucide-react";
import type {
	Control,
	FieldArrayWithId,
	UseFieldArrayAppend,
	UseFieldArrayRemove,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { AddCommandForm } from "./add-command";

interface SingleCommandFieldsProps {
	control: Control<AddCommandForm>;
	fields: FieldArrayWithId<AddCommandForm, "args", "id">[];
	append: UseFieldArrayAppend<AddCommandForm, "args">;
	remove: UseFieldArrayRemove;
}

export const SingleCommandFields = ({
	control,
	fields,
	append,
	remove,
}: SingleCommandFieldsProps) => {
	return (
		<>
			<FormField
				control={control}
				name="command"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Command</FormLabel>
						<FormControl>
							<Input placeholder="/bin/sh" {...field} />
						</FormControl>

						<FormMessage />
					</FormItem>
				)}
			/>

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<FormLabel>Arguments (Args)</FormLabel>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => append({ value: "" })}
					>
						<Plus className="h-4 w-4 mr-1" />
						Add Argument
					</Button>
				</div>

				{fields.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No arguments added yet. Click "Add Argument" to add one.
					</p>
				)}

				{fields.map((field, index) => (
					<FormField
						key={field.id}
						control={control}
						name={`args.${index}.value`}
						render={({ field }) => (
							<FormItem>
								<div className="flex gap-2">
									<FormControl>
										<Input
											placeholder={index === 0 ? "-c" : "echo Hello World"}
											{...field}
										/>
									</FormControl>
									<Button
										type="button"
										variant="destructive"
										size="icon"
										onClick={() => remove(index)}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>
				))}
			</div>
		</>
	);
};
