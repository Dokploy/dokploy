import {
	getS3StorageClassesForProvider,
	isValidS3StorageClassForProvider,
	normalizeS3StorageClass,
	S3_PROVIDER_STORAGE_CLASS_OPTIONS,
} from "@dokploy/server/utils/backups/s3-storage-class";
import { describe, expect, it } from "vitest";
import {
	getS3StorageClassOptionsByProvider,
	S3_PROVIDER_STORAGE_CLASS_OPTIONS as UI_STORAGE_CLASS_OPTIONS,
} from "../../components/dashboard/database/backups/constants";

describe("s3-storage-class utility", () => {
	it("normalizes storage class values", () => {
		expect(normalizeS3StorageClass(undefined)).toBeUndefined();
		expect(normalizeS3StorageClass(null)).toBeUndefined();
		expect(normalizeS3StorageClass("   ")).toBeUndefined();
		expect(normalizeS3StorageClass(" GLACIER ")).toBe("GLACIER");
	});

	it("returns provider-specific storage class options", () => {
		expect(getS3StorageClassesForProvider(undefined)).toEqual([]);
		expect(getS3StorageClassesForProvider(null)).toEqual([]);
		expect(getS3StorageClassesForProvider("UNKNOWN")).toEqual([]);
		expect(getS3StorageClassesForProvider("AWS")).toEqual(
			S3_PROVIDER_STORAGE_CLASS_OPTIONS.AWS,
		);
	});

	it("validates storage class against provider capabilities", () => {
		expect(
			isValidS3StorageClassForProvider({
				provider: "AWS",
				storageClass: "GLACIER",
			}),
		).toBe(true);
		expect(
			isValidS3StorageClassForProvider({
				provider: "AWS",
				storageClass: "INVALID",
			}),
		).toBe(false);
		expect(
			isValidS3StorageClassForProvider({
				provider: "UNKNOWN",
				storageClass: "GLACIER",
			}),
		).toBe(false);
		expect(
			isValidS3StorageClassForProvider({
				provider: "AWS",
				storageClass: "   ",
			}),
		).toBe(true);
	});
});

describe("backup storage-class UI options", () => {
	it("returns options only for supported providers", () => {
		expect(getS3StorageClassOptionsByProvider(undefined)).toEqual([]);
		expect(getS3StorageClassOptionsByProvider(null)).toEqual([]);
		expect(getS3StorageClassOptionsByProvider("UNKNOWN")).toEqual([]);
		expect(getS3StorageClassOptionsByProvider("AWS")).toEqual(
			UI_STORAGE_CLASS_OPTIONS.AWS,
		);
	});
});
