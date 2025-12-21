/**
 * Get UTC offset string for a given IANA timezone
 * @param timeZone - IANA timezone identifier (e.g., "America/New_York", "Asia/Tokyo")
 * @returns Formatted offset string (e.g., "UTC+09:00", "UTC-05:00")
 */
export function getUtcOffset(timeZone: string): string {
    try {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            timeZoneName: "longOffset",
        });
        const parts = formatter.formatToParts(new Date());
        const offsetPart = parts.find((p) => p.type === "timeZoneName");
        const offset = offsetPart?.value;

        if (!offset || offset === "GMT") {
            return "UTC+00:00";
        }

        return offset.replace("GMT", "UTC");
    } catch (error) {
        return "UTC+00:00";
    }
}