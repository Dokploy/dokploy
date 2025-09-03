"use client";

import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface PermissionModeProps {
	value?: string | null;
	onChange?: (octal: string) => void;
	className?: string;
	disabled?: boolean;
	showAdvancedInput?: boolean;
}

// Convert rwx booleans to a single octal digit
function rwxToOctal(r: boolean, w: boolean, x: boolean): number {
	return (r ? 4 : 0) + (w ? 2 : 0) + (x ? 1 : 0);
}

// Normalize any input to 3-digit octal like 644. Accepts 3 or 4 digits.
function normalizeMode(mode?: string | null): string | undefined {
	if (!mode) return undefined;
	const m = mode.trim();
	if (!/^\d{3,4}$/.test(m)) return undefined;
	if (m.length === 3) return m;
	// if 4 digits like 0755, drop leading zero for UI consistency
	if (m.length === 4 && m[0] === "0") return m.slice(1);
	// otherwise keep the last 3 digits (ignore special bits in UI)
	return m.slice(-3);
}

export const PermissionMode = ({
	value,
	onChange,
	className,
	disabled,
	showAdvancedInput = true,
}: PermissionModeProps) => {
	const normalized = useMemo(() => normalizeMode(value) ?? "644", [value]);
	const [owner, setOwner] = useState({ r: true, w: true, x: false });
	const [group, setGroup] = useState({ r: true, w: false, x: false });
	const [other, setOther] = useState({ r: true, w: false, x: false });
	const [touched, setTouched] = useState(false);

	// Sync incoming value to checkboxes
	useEffect(() => {
		const n = normalizeMode(value);
		if (!n) return; // keep defaults, do not mark touched
		const [o, g, t] = n
			.slice(-3)
			.split("")
			.map((d) => parseInt(d, 10)) as [number, number, number];
		const toBits = (d: number) => ({
			r: !!(d & 4),
			w: !!(d & 2),
			x: !!(d & 1),
		});
		setOwner(toBits(o));
		setGroup(toBits(g));
		setOther(toBits(t));
		// reset touched so we don't emit onChange until user interacts
		setTouched(false);
	}, [value]);

	// Compute octal only after user interaction
	useEffect(() => {
		if (!touched) return;
		const o = rwxToOctal(owner.r, owner.w, owner.x);
		const g = rwxToOctal(group.r, group.w, group.x);
		const t = rwxToOctal(other.r, other.w, other.x);
		const octal = `${o}${g}${t}`;
		onChange?.(octal);
	}, [owner, group, other, onChange, touched]);

	return (
		<div className={cn("space-y-2", className)}>
			<div className="grid grid-cols-4 gap-2 text-sm text-muted-foreground">
				<div />
				<div className="text-center">Owner</div>
				<div className="text-center">Group</div>
				<div className="text-center">Others</div>
			</div>
			<div className="grid grid-cols-4 gap-2 items-center">
				<Label className="text-sm">Read</Label>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={owner.r}
						onCheckedChange={(v) => {
							setOwner((s) => ({ ...s, r: !!v }));
							setTouched(true);
						}}
					/>
				</div>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={group.r}
						onCheckedChange={(v) => {
							setGroup((s) => ({ ...s, r: !!v }));
							setTouched(true);
						}}
					/>
				</div>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={other.r}
						onCheckedChange={(v) => {
							setOther((s) => ({ ...s, r: !!v }));
							setTouched(true);
						}}
					/>
				</div>
			</div>
			<div className="grid grid-cols-4 gap-2 items-center">
				<Label className="text-sm">Write</Label>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={owner.w}
						onCheckedChange={(v) => {
							setOwner((s) => ({ ...s, w: !!v }));
							setTouched(true);
						}}
					/>
				</div>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={group.w}
						onCheckedChange={(v) => {
							setGroup((s) => ({ ...s, w: !!v }));
							setTouched(true);
						}}
					/>
				</div>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={other.w}
						onCheckedChange={(v) => {
							setOther((s) => ({ ...s, w: !!v }));
							setTouched(true);
						}}
					/>
				</div>
			</div>
			<div className="grid grid-cols-4 gap-2 items-center">
				<Label className="text-sm">Execute</Label>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={owner.x}
						onCheckedChange={(v) => {
							setOwner((s) => ({ ...s, x: !!v }));
							setTouched(true);
						}}
					/>
				</div>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={group.x}
						onCheckedChange={(v) => {
							setGroup((s) => ({ ...s, x: !!v }));
							setTouched(true);
						}}
					/>
				</div>
				<div className="flex justify-center">
					<Checkbox
						disabled={disabled}
						checked={other.x}
						onCheckedChange={(v) => {
							setOther((s) => ({ ...s, x: !!v }));
							setTouched(true);
						}}
					/>
				</div>
			</div>

			{showAdvancedInput && (
				<div className="pt-2">
					<Label className="text-xs text-muted-foreground">Octal</Label>
					<Input className="mt-1" value={normalized} disabled readOnly />
				</div>
			)}
		</div>
	);
};

export default PermissionMode;
