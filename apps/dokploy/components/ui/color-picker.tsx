"use client";

import debounce from "lodash/debounce";
import { Pipette } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

// ─── Color helpers ──────────────────────────────────────────────────

function parseColor(colorString: string): {
	r: number;
	g: number;
	b: number;
	a: number;
} {
	if (!colorString) return { r: 255, g: 255, b: 255, a: 1 };

	if (colorString.startsWith("#")) {
		const hex = colorString.slice(1);
		const r = Number.parseInt(hex.slice(0, 2), 16);
		const g = Number.parseInt(hex.slice(2, 4), 16);
		const b = Number.parseInt(hex.slice(4, 6), 16);
		const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
		return {
			r: Number.isNaN(r) ? 0 : r,
			g: Number.isNaN(g) ? 0 : g,
			b: Number.isNaN(b) ? 0 : b,
			a,
		};
	}

	return { r: 255, g: 255, b: 255, a: 1 };
}

function rgbaToHex(rgba: {
	r: number;
	g: number;
	b: number;
	a: number;
}): string {
	const r = Math.round(rgba.r).toString(16).padStart(2, "0");
	const g = Math.round(rgba.g).toString(16).padStart(2, "0");
	const b = Math.round(rgba.b).toString(16).padStart(2, "0");
	return `#${r}${g}${b}`;
}

function getHexOnly(colorValue: string): string {
	if (!colorValue) return "#000000";
	if (colorValue.length >= 7 && colorValue.startsWith("#"))
		return colorValue.slice(0, 7);
	return "#000000";
}

function hslToRgb(
	_h: number,
	_s: number,
	_l: number,
): { r: number; g: number; b: number } {
	let h = _h / 360;
	let s = _s / 100;
	let l = _l / 100;
	let r: number;
	let g: number;
	let b: number;
	if (s === 0) {
		r = g = b = l;
	} else {
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}
	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255),
	};
}

function hsvToRgb(
	_h: number,
	_s: number,
	_v: number,
): { r: number; g: number; b: number } {
	const h = _h / 360;
	const s = _s / 100;
	const v = _v / 100;
	let r = 0;
	let g = 0;
	let b = 0;
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);
	switch (i % 6) {
		case 0:
			r = v;
			g = t;
			b = p;
			break;
		case 1:
			r = q;
			g = v;
			b = p;
			break;
		case 2:
			r = p;
			g = v;
			b = t;
			break;
		case 3:
			r = p;
			g = q;
			b = v;
			break;
		case 4:
			r = t;
			g = p;
			b = v;
			break;
		case 5:
			r = v;
			g = p;
			b = q;
			break;
	}
	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255),
	};
}

function rgbToHsv(
	_r: number,
	_g: number,
	_b: number,
): { h: number; s: number; v: number } {
	const r = _r / 255;
	const g = _g / 255;
	const b = _b / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	const s = max === 0 ? 0 : d / max;
	const v = max;
	if (max !== min) {
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}
	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		v: Math.round(v * 100),
	};
}

// ─── SaturationValuePicker ──────────────────────────────────────────

function SaturationValuePicker({
	hue,
	saturation,
	value,
	onChange,
}: {
	hue: number;
	saturation: number;
	value: number;
	onChange: (s: number, v: number) => void;
}) {
	const pickerRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const dragRectRef = useRef<DOMRect | null>(null);

	const x = saturation;
	const y = 100 - value;

	const updatePosition = useCallback(
		(e: MouseEvent | React.MouseEvent) => {
			const rect =
				dragRectRef.current || pickerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const xPos = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
			const yPos = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
			const newS =
				rect.width > 0 ? Math.min(100, (xPos / rect.width) * 100) : 0;
			const newV =
				rect.height > 0 ? Math.max(0, 100 - (yPos / rect.height) * 100) : 0;
			onChange(newS, newV);
		},
		[onChange],
	);

	const handleMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		if (pickerRef.current)
			dragRectRef.current = pickerRef.current.getBoundingClientRect();
		setIsDragging(true);
		updatePosition(e);
	};

	useEffect(() => {
		if (!isDragging) return;
		const onMove = (e: MouseEvent) => updatePosition(e);
		const onUp = () => {
			setIsDragging(false);
			dragRectRef.current = null;
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [isDragging, updatePosition]);

	const fullColor = hslToRgb(hue, 100, 50);
	const bg = `linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(0,0,0,1) 100%), linear-gradient(to right, rgba(255,255,255,1) 0%, rgb(${fullColor.r},${fullColor.g},${fullColor.b}) 100%)`;

	return (
		<div
			ref={pickerRef}
			className="relative w-full h-full rounded-md overflow-hidden touch-none outline outline-white/15 -outline-offset-1 cursor-crosshair"
			style={{ background: bg, backgroundBlendMode: "multiply" }}
			onMouseDown={handleMouseDown}
		>
			<div
				className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
				style={{ left: `${x}%`, top: `${y}%` }}
			>
				<div className="size-3.5 rounded-full border-2 border-white shadow-md" />
			</div>
		</div>
	);
}

// ─── HueBar ─────────────────────────────────────────────────────────

function HueBar({
	hue,
	onChange,
}: {
	hue: number;
	onChange: (h: number) => void;
}) {
	const barRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	const position = Math.max(2, Math.min(98, (hue / 360) * 100));

	const updateHue = useCallback(
		(e: MouseEvent | React.MouseEvent) => {
			if (!barRef.current) return;
			const rect = barRef.current.getBoundingClientRect();
			const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
			onChange(Math.round(Math.max(0, Math.min(360, (x / rect.width) * 360))));
		},
		[onChange],
	);

	const handleMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		setIsDragging(true);
		updateHue(e);
	};

	useEffect(() => {
		if (!isDragging) return;
		const onMove = (e: MouseEvent) => updateHue(e);
		const onUp = () => setIsDragging(false);
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [isDragging, updateHue]);

	return (
		<div
			ref={barRef}
			className="relative h-3 w-full rounded-full cursor-pointer"
			style={{
				background:
					"linear-gradient(90deg, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
			}}
			onMouseDown={handleMouseDown}
		>
			<div
				className="absolute top-0 -translate-x-1/2 pointer-events-none z-10"
				style={{ left: `${position}%` }}
			>
				<div className="size-3 rounded-full border-[1.5px] border-white shadow-md" />
			</div>
		</div>
	);
}

// ─── Main ColorPicker ───────────────────────────────────────────────

interface ColorPickerProps {
	value?: string;
	onChange: (value: string) => void;
	defaultValue?: string;
	placeholder?: string;
}

export function ColorPicker({
	value,
	onChange,
	defaultValue = "#3b82f6",
	placeholder = "#000000",
}: ColorPickerProps) {
	const [open, setOpen] = useState(false);
	const displayValue = value || "";

	const [rgbaColor, setRgbaColor] = useState(() =>
		parseColor(displayValue || defaultValue),
	);
	const [hue, setHue] = useState(
		() => rgbToHsv(rgbaColor.r, rgbaColor.g, rgbaColor.b).h,
	);
	const [saturation, setSaturation] = useState(
		() => rgbToHsv(rgbaColor.r, rgbaColor.g, rgbaColor.b).s,
	);
	const [hsvValue, setHsvValue] = useState(
		() => rgbToHsv(rgbaColor.r, rgbaColor.g, rgbaColor.b).v,
	);
	const [hexInput, setHexInput] = useState(() =>
		getHexOnly(displayValue || defaultValue),
	);

	const isInternalUpdate = useRef(false);
	const isHexInputUpdate = useRef(false);

	useEffect(() => {
		if (!isHexInputUpdate.current) {
			setHexInput(getHexOnly(rgbaToHex(rgbaColor)));
		}
		isHexInputUpdate.current = false;
	}, [rgbaColor]);

	useEffect(() => {
		if (displayValue && !isInternalUpdate.current) {
			const c = parseColor(displayValue);
			setRgbaColor(c);
			const hsv = rgbToHsv(c.r, c.g, c.b);
			setHue(hsv.h);
			setSaturation(hsv.s);
			setHsvValue(hsv.v);
		}
		isInternalUpdate.current = false;
	}, [displayValue]);

	const debouncedOnChange = useRef(debounce((v: string) => onChange(v), 100));
	useEffect(() => {
		debouncedOnChange.current = debounce((v: string) => onChange(v), 100);
		return () => debouncedOnChange.current.cancel();
	}, [onChange]);

	const handleChange = (color: {
		r: number;
		g: number;
		b: number;
		a: number;
	}) => {
		setRgbaColor(color);
		isInternalUpdate.current = true;
		debouncedOnChange.current(rgbaToHex(color));
	};

	const handleEyeDropper = async () => {
		if (!("EyeDropper" in window)) return;
		try {
			// @ts-ignore
			const result = await new window.EyeDropper().open();
			const parsed = parseColor(result.sRGBHex);
			setRgbaColor(parsed);
			const hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
			setHue(hsv.h);
			setSaturation(hsv.s);
			setHsvValue(hsv.v);
			isInternalUpdate.current = true;
			onChange(rgbaToHex(parsed));
		} catch {
			/* cancelled */
		}
	};

	const handleHexChange = (val: string) => {
		let v = val.trim();
		if (v && !v.startsWith("#")) v = `#${v}`;
		setHexInput(v);

		if (v.length === 7 && /^#[0-9a-fA-F]{6}$/.test(v)) {
			isHexInputUpdate.current = true;
			isInternalUpdate.current = true;
			const parsed = parseColor(v);
			setRgbaColor(parsed);
			const hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
			setHue(hsv.h);
			setSaturation(hsv.s);
			setHsvValue(hsv.v);
			onChange(v);
		}
	};

	const handleHexBlur = () => {
		setHexInput(getHexOnly(rgbaToHex(rgbaColor)));
	};

	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
		if (newOpen && !displayValue) {
			const def = parseColor(defaultValue);
			setRgbaColor(def);
			const hsv = rgbToHsv(def.r, def.g, def.b);
			setHue(hsv.h);
			setSaturation(hsv.s);
			setHsvValue(hsv.v);
		}
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex items-center h-9 w-full rounded-md border border-input bg-transparent px-3 gap-2 text-sm transition-colors hover:bg-accent cursor-pointer"
				>
					<div
						className="size-5 rounded-md shrink-0 border border-border"
						style={{
							backgroundColor: displayValue || defaultValue,
						}}
					/>
					<span className="text-muted-foreground truncate">
						{displayValue || placeholder}
					</span>
				</button>
			</PopoverTrigger>

			<PopoverContent className="w-56 p-3" align="start">
				<div className="flex flex-col gap-3">
					<div className="w-full relative aspect-[4/3]">
						<SaturationValuePicker
							hue={hue}
							saturation={saturation}
							value={hsvValue}
							onChange={(s, v) => {
								setSaturation(s);
								setHsvValue(v);
								const rgb = hsvToRgb(hue, s, v);
								handleChange({ ...rgb, a: 1 });
							}}
						/>
					</div>

					<HueBar
						hue={hue}
						onChange={(newHue) => {
							setHue(newHue);
							const rgb = hsvToRgb(newHue, saturation, hsvValue);
							handleChange({ ...rgb, a: 1 });
						}}
					/>

					<div className="flex items-center gap-2">
						<InputGroup className="flex-1">
							<InputGroupInput
								type="text"
								value={hexInput}
								onChange={(e) => handleHexChange(e.target.value)}
								onBlur={handleHexBlur}
								onKeyDown={(e) => {
									if (e.key === "Enter") (e.target as HTMLInputElement).blur();
								}}
								placeholder={placeholder}
							/>
							<InputGroupAddon align="inline-end">
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6"
									onClick={handleEyeDropper}
									type="button"
								>
									<Pipette className="size-3.5" />
								</Button>
							</InputGroupAddon>
						</InputGroup>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
