import type {DiagnosticFunctionItem, VehicleListType, VehicleSelectionItem} from '../mobileClient';

export type SelectionSource = 'manual' | 'vin' | 'history';

export type SelectionNode = {
    type: VehicleListType;
    id: string;
    label: string;
};

export const selectionSteps: Array<{type: VehicleListType; label: string; listLabel: string}> = [
    {type: 'brands', label: 'Brand', listLabel: 'brands'},
    {type: 'models', label: 'Model', listLabel: 'models'},
    {type: 'years', label: 'Year', listLabel: 'years'},
    {type: 'systemTypes', label: 'Type of system', listLabel: 'system types'},
    {type: 'engines', label: 'System', listLabel: 'systems'},
    {type: 'systems', label: 'Name', listLabel: 'names'},
    {type: 'gearboxes', label: 'Gearbox', listLabel: 'gearboxes'},
    {type: 'equipments', label: 'Equipment', listLabel: 'equipment choices'},
];

export const errorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as {message: unknown}).message);
    }
    return String(error);
};

export const itemLabel = (item: VehicleSelectionItem): string => item.title || item.name || item.id;

export const functionLabel = (item: DiagnosticFunctionItem): string =>
    item.title || item.name || item.id || `Function ${String(item.index ?? '')}`;

export const functionIndex = (item: DiagnosticFunctionItem): number | null => {
    const index = Number(item.index);
    return Number.isInteger(index) ? index : null;
};

export const rawVin = (value: string): string =>
    value.replace(/\s/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);

export const formatVin = (value: string): string => {
    const cleaned = rawVin(value);
    return [cleaned.slice(0, 3), cleaned.slice(3, 11), cleaned.slice(11, 17)].filter(Boolean).join(' ');
};

export const stepIndex = (type: VehicleListType): number =>
    selectionSteps.findIndex((step) => step.type === type);
