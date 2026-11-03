import { keepPreviousData } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { useDebounce } from "@/utils/hooks/use-debounce";

const VISIBLE_ROWS = 5;
// Rows are h-12; the extra 0.5rem covers the list's p-1.
const LIST_MAX_HEIGHT = `calc(${VISIBLE_ROWS} * 3rem + 0.5rem)`;

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
	value: string;
	onChange: (value: string) => void;
};

const Highlight = ({ text, query }: { text: string; query: string }) => {
	const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
	if (index === -1) {
		return <>{text}</>;
	}
	return (
		<>
			{text.slice(0, index)}
			<mark className="bg-transparent font-semibold text-foreground">
				{text.slice(index, index + query.length)}
			</mark>
			{text.slice(index + query.length)}
		</>
	);
};

export const RecipientEmailInput = ({
	value,
	onChange,
	onKeyDown,
	...inputProps
}: Props) => {
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const anchorRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const listId = useId();
	const typed = value.trim();
	const query = useDebounce(typed, 200);

	const { data, isError } = api.ownershipTransfer.searchRecipients.useQuery(
		{ query },
		{
			enabled: open && query.length > 0,
			placeholderData: keepPreviousData,
			staleTime: 30_000,
		},
	);
	const users = data?.users ?? [];
	const showList = open && typed.length > 0;

	useEffect(() => {
		setActiveIndex(-1);
	}, [data]);

	useEffect(() => {
		if (activeIndex < 0) return;
		listRef.current
			?.querySelector(`[data-index="${activeIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	const select = (email: string) => {
		onChange(email);
		setOpen(false);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		onKeyDown?.(event);
		if (event.defaultPrevented) return;

		const active = users[activeIndex];
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setOpen(true);
			setActiveIndex((index) => Math.min(index + 1, users.length - 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((index) => Math.max(index - 1, 0));
		} else if (event.key === "Enter" && showList && active) {
			// Without an active option, Enter falls through and submits the form.
			event.preventDefault();
			select(active.email);
		} else if (event.key === "Escape" && showList) {
			event.preventDefault();
			setOpen(false);
		}
	};

	return (
		<Popover
			open={showList}
			onOpenChange={(next) => {
				if (!next) setOpen(false);
			}}
		>
			<PopoverAnchor asChild>
				<div ref={anchorRef}>
					<Input
						{...inputProps}
						value={value}
						onChange={(event) => {
							onChange(event.target.value);
							setOpen(true);
						}}
						onKeyDown={handleKeyDown}
						role="combobox"
						autoComplete="off"
						aria-autocomplete="list"
						aria-expanded={showList}
						aria-controls={showList ? listId : undefined}
						aria-activedescendant={
							showList && activeIndex >= 0
								? `${listId}-${activeIndex}`
								: undefined
						}
					/>
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				className="w-[var(--radix-popover-trigger-width)] gap-0 p-0"
				// Focus stays in the input so typing can continue.
				onOpenAutoFocus={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => event.preventDefault()}
				onInteractOutside={(event) => {
					if (anchorRef.current?.contains(event.target as Node)) {
						event.preventDefault();
					}
				}}
			>
				{isError ? (
					<p className="px-3 py-2 text-sm text-muted-foreground">
						Couldn't load users
					</p>
				) : !data ? (
					<p className="px-3 py-2 text-sm text-muted-foreground">
						Searching...
					</p>
				) : users.length === 0 ? (
					<p className="break-words px-3 py-2 text-sm text-muted-foreground">
						No users match "{typed}"
					</p>
				) : (
					<>
						<div
							ref={listRef}
							id={listId}
							role="listbox"
							className="overflow-y-auto p-1"
							style={{ maxHeight: LIST_MAX_HEIGHT }}
						>
							{users.map((user, index) => {
								const name = [user.firstName, user.lastName]
									.filter(Boolean)
									.join(" ");
								return (
									// Keyboard selection is handled on the input, as the
									// combobox pattern requires; options never take focus.
									<div
										key={user.id}
										id={`${listId}-${index}`}
										data-index={index}
										role="option"
										aria-selected={index === activeIndex}
										tabIndex={-1}
										className={cn(
											"flex h-12 cursor-pointer flex-col justify-center rounded-md px-2",
											index === activeIndex && "bg-accent",
										)}
										onMouseDown={(event) => event.preventDefault()}
										onMouseMove={() => setActiveIndex(index)}
										onClick={() => select(user.email)}
									>
										{name && (
											<span className="truncate text-sm font-medium">
												<Highlight text={name} query={typed} />
											</span>
										)}
										<span
											className={cn(
												"truncate",
												name
													? "text-xs text-muted-foreground"
													: "text-sm font-medium",
											)}
										>
											<Highlight text={user.email} query={typed} />
										</span>
									</div>
								);
							})}
						</div>
						{data.hasMore && (
							<p className="border-t px-3 py-2 text-xs text-muted-foreground">
								More users match. Keep typing to narrow it down.
							</p>
						)}
					</>
				)}
			</PopoverContent>
		</Popover>
	);
};
