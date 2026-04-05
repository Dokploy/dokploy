/** Round a value+unit string like "2.711MiB" → "2.7 MiB" */
export const formatSizeValue = (raw: string): string => {
	const match = raw.match(/^([\d.]+)\s*([A-Za-z]+)$/);
	if (!match?.[1] || !match[2]) return raw;
	const num = Number.parseFloat(match[1]);
	const unit = match[2];
	if (Number.isNaN(num)) return raw;
	const rounded = num >= 1 ? num.toFixed(1) : num.toFixed(2);
	return `${rounded} ${unit}`;
};

/** Format "2.711MiB / 7.609GiB" → "2.7 MiB / 7.6 GiB" */
export const formatMemUsage = (raw: string): string => {
	const [left, right] = raw.split("/").map((s) => s.trim());
	if (!left || !right) return raw;
	return `${formatSizeValue(left)} / ${formatSizeValue(right)}`;
};

/** Format "978B / 252B" → "978 B / 252 B" */
export const formatIOValue = (raw: string): string => {
	const [left, right] = raw.split("/").map((s) => s.trim());
	if (!left || !right) return raw;
	return `${formatSizeValue(left)} / ${formatSizeValue(right)}`;
};

/** Format "0.00%" → "0.0%", "12.345%" → "12.3%" */
export const formatCpu = (raw: string): string => {
	const num = Number.parseFloat(raw.replace("%", ""));
	if (Number.isNaN(num)) return raw;
	return `${num.toFixed(1)}%`;
};
