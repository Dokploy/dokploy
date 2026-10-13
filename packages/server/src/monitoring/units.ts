const IO_UNIT_FACTORS: Record<string, number> = {
	B: 1 / 1e6,
	kB: 1e-3,
	KB: 1e-3,
	MB: 1,
	GB: 1e3,
	TB: 1e6,
	KiB: 1024 / 1e6,
	MiB: 1024 ** 2 / 1e6,
	GiB: 1024 ** 3 / 1e6,
	TiB: 1024 ** 4 / 1e6,
};

export const toMb = (value: number | string | undefined): number => {
	if (typeof value === "number") {
		return value;
	}
	if (!value) {
		return 0;
	}
	const parsed = Number.parseFloat(value);
	if (Number.isNaN(parsed)) {
		return 0;
	}
	const unit = value.replace(/[0-9.\s]/g, "");
	return parsed * (IO_UNIT_FACTORS[unit] ?? 1);
};

export const parseIoToMb = (raw: string | undefined): number =>
	Number(toMb(raw).toFixed(6));

export const formatMb = (value: number | string | undefined): string => {
	const mb = toMb(value);
	if (mb >= 1000) {
		return `${(mb / 1000).toFixed(2)} GB`;
	}
	if (mb < 0.01 && mb > 0) {
		return `${(mb * 1000).toFixed(2)} kB`;
	}
	return `${mb.toFixed(2)} MB`;
};
