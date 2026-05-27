const DISPLAY_SOFTWARE_NAME = /\bautocom\b/gi;
const EMBEDDED_SOFTWARE_IDENTIFIER = /autocom/gi;

export const redactDisplayText = (value: string): string =>
    value
        .replace(DISPLAY_SOFTWARE_NAME, 'Diagnostic Engine Console')
        .replace(EMBEDDED_SOFTWARE_IDENTIFIER, 'diagnostic_engine');

export const redactDisplayValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
        return redactDisplayText(value);
    }

    if (Array.isArray(value)) {
        return value.map(redactDisplayValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
                redactDisplayText(key),
                redactDisplayValue(nestedValue),
            ]),
        );
    }

    return value;
};