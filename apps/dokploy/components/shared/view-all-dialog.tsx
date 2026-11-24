import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const SEARCHABLE_FROM = 10;
const VISIBLE_ROWS = 7;
const LIST_MAX_HEIGHT = `calc(${VISIBLE_ROWS} * 2.25rem + ${VISIBLE_ROWS + 1}px)`;

interface Props {
	items: { id: string; label: string }[];
	title: string;
	noun: { one: string; other: string };
	triggerLabel?: string;
}

export const ViewAllDialog = ({ items, title, noun, triggerLabel }: Props) => {
	const [search, setSearch] = useState("");

	if (items.length === 0) {
		return null;
	}

	const query = search.trim().toLowerCase();
	const filtered = query
		? items.filter((item) => item.label.toLowerCase().includes(query))
		: items;

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) setSearch("");
			}}
		>
			<DialogTrigger asChild>
				<button
					type="button"
					className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
				>
					{triggerLabel ?? `View all ${noun.other}`}
				</button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{items.length === 1
							? `1 ${noun.one}`
							: `${items.length} ${noun.other}`}
					</DialogDescription>
				</DialogHeader>
				{items.length > SEARCHABLE_FROM && (
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={`Search ${noun.other}`}
					/>
				)}
				<ul
					className="divide-y overflow-y-auto rounded-md border"
					style={{ maxHeight: LIST_MAX_HEIGHT }}
				>
					{filtered.map((item) => (
						<li
							key={item.id}
							title={item.label}
							className="h-9 truncate px-3 text-sm leading-9"
						>
							{item.label}
						</li>
					))}
					{filtered.length === 0 && (
						<li className="h-9 truncate px-3 text-sm leading-9 text-muted-foreground">
							No {noun.other} match "{search.trim()}"
						</li>
					)}
				</ul>
			</DialogContent>
		</Dialog>
	);
};
