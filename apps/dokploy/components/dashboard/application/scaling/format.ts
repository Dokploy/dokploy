import { z } from "zod";

export const wholeNumber = (min: number, max: number) =>
	z
		.number({ error: "Enter a number" })
		.int("Enter a whole number")
		.min(min, `Must be at least ${min}`)
		.max(max, `Must be at most ${max}`);

const NANO_CPUS_PER_CORE = 1_000_000_000;
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export const formatCpu = (nanoCpus: number) => {
	const cores = nanoCpus / NANO_CPUS_PER_CORE;
	return `${Number.isInteger(cores) ? cores : cores.toFixed(2)} CPU`;
};

export const formatCoreAmount = (cores: number) =>
	cores < 0.1 ? cores.toFixed(3) : cores.toFixed(2);

export const formatCores = (cores: number) => `${formatCoreAmount(cores)} CPU`;

export const formatPercent = (percent: number | null) =>
	percent === null ? null : `${Math.round(percent)}%`;

export const formatMemory = (bytes: number) => {
	if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)} GiB`;
	const mib = bytes / MIB;
	return `${mib < 10 ? mib.toFixed(1) : Math.round(mib)} MiB`;
};
