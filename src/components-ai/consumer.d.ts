import type { EventHandle, HandleEvent, History, Observer } from '@playcanvas/observer';
import type { JSX, Key, ReactNode } from 'react';

/** Structural PCUI boundary that does not expose fork-internal declarations. */
export interface PcuiImperativeElement {
    readonly dom: HTMLElement;
    on(name: string, callback: HandleEvent): EventHandle;
    destroy(): void;
}

export type PcuiHandler<T extends PcuiImperativeElement> = (
    element: T,
    ...args: unknown[]
) => void;
export type PcuiHandlers<T extends PcuiImperativeElement> = Readonly<
    Record<string, PcuiHandler<T> | undefined>
>;
export type PcuiBridgeProps<
    T extends PcuiImperativeElement,
    Values extends object
> = Readonly<{
    create: () => T;
    values: Values;
    sync: (element: T, next: Values, previous: Values | undefined) => void;
    equal?: (next: Values, previous: Values) => boolean;
    events?: PcuiHandlers<T>;
    className?: string;
    ariaLabel?: string;
}>;
export declare function PcuiBridge<
    T extends PcuiImperativeElement,
    Values extends object
>(props: PcuiBridgeProps<T, Values>): JSX.Element;

export type PcuiBoundTextAreaProps = Readonly<{
    observer: Observer;
    path: string;
    history: History;
    placeholder?: string;
    enabled?: boolean;
    readOnly?: boolean;
    historyName?: string;
    className?: string;
    inputClassName?: string;
    ariaLabel?: string;
    resizable?: 'horizontal' | 'vertical' | 'both' | 'none';
}>;
export declare function PcuiBoundTextArea(
    props: PcuiBoundTextAreaProps
): JSX.Element;

export type PcuiBoundNumericInputProps = Readonly<{
    observer: Observer;
    path: string;
    history: History;
    min?: number | null;
    max?: number | null;
    step?: number;
    precision?: number;
    enabled?: boolean;
    readOnly?: boolean;
    historyName?: string;
}>;
export declare function PcuiBoundNumericInput(
    props: PcuiBoundNumericInputProps
): JSX.Element;

export type PcuiBoundVectorInputProps = PcuiBoundNumericInputProps;
export declare function PcuiBoundVectorInput(
    props: PcuiBoundVectorInputProps
): JSX.Element;

export type PcuiSelectValue = boolean | number | string;
export type PcuiSelectOption = Readonly<{ t: string; v: PcuiSelectValue }>;
export type PcuiBoundSelectInputProps = Readonly<{
    observer: Observer;
    path: string;
    history: History;
    options: readonly PcuiSelectOption[];
    valueType: 'boolean' | 'number' | 'string';
    enabled?: boolean;
    readOnly?: boolean;
    historyName?: string;
}>;
export declare function PcuiBoundSelectInput(
    props: PcuiBoundSelectInputProps
): JSX.Element;

export type PcuiBoundBooleanInputProps = Readonly<{
    observer: Observer;
    path: string;
    history: History;
    enabled?: boolean;
    readOnly?: boolean;
    historyName?: string;
}>;
export declare function PcuiBoundBooleanInput(
    props: PcuiBoundBooleanInputProps
): JSX.Element;

export type PcuiBoundColorPickerProps = PcuiBoundBooleanInputProps;
export declare function PcuiBoundColorPicker(
    props: PcuiBoundColorPickerProps
): JSX.Element;

export type PcuiCollapsiblePanelProps = Readonly<{
    title: string;
    children: ReactNode;
    collapsed?: boolean;
    enabled?: boolean;
}>;
export declare function PcuiCollapsiblePanel(
    props: PcuiCollapsiblePanelProps
): JSX.Element;

export type JsonSchemaScalar = boolean | number | string | null;
export type JsonSchemaType =
    | 'array'
    | 'boolean'
    | 'integer'
    | 'null'
    | 'number'
    | 'object'
    | 'string';
export type JsonSchema = Readonly<{
    $ref?: string;
    $defs?: Readonly<Record<string, JsonSchema>>;
    definitions?: Readonly<Record<string, JsonSchema>>;
    title?: string;
    description?: string;
    type?: JsonSchemaType | readonly JsonSchemaType[];
    const?: unknown;
    enum?: readonly JsonSchemaScalar[];
    properties?: Readonly<Record<string, JsonSchema>>;
    additionalProperties?: boolean | JsonSchema;
    items?: JsonSchema | readonly JsonSchema[];
    minItems?: number;
    maxItems?: number;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
    pattern?: string;
    format?: string;
    readOnly?: boolean;
}>;
export type AutoInspectorChange = Readonly<{
    /** RFC 6901 JSON Pointer. */
    pointer: string;
    /** Dot-delimited path accepted by @playcanvas/observer. */
    path: string;
    oldValue: unknown;
    newValue: unknown;
}>;
export type AutoInspectorProps = Readonly<{
    schema: JsonSchema;
    observer: Observer;
    history?: History;
    onChange?: (change: AutoInspectorChange) => void;
    enabled?: boolean;
    className?: string;
}>;
export declare function AutoInspector(props: AutoInspectorProps): JSX.Element;
export declare function observerPathToJsonPointer(path: string): string;

export type VariantStripLayout = 'cards' | 'compact';
export type VariantStripRenderState = Readonly<{
    id: Key;
    index: number;
    layout: VariantStripLayout;
    chosen: boolean;
    inspected: boolean;
    previewing: boolean;
}>;
export type VariantStripProps<Variant> = Readonly<{
    variants: readonly Variant[];
    getId: (variant: Variant, index: number) => Key;
    renderContent: (
        variant: Variant,
        state: VariantStripRenderState
    ) => ReactNode;
    renderActions?: (
        variant: Variant,
        state: VariantStripRenderState
    ) => ReactNode;
    chosenId?: Key | null;
    inspectedId?: Key | null;
    previewId?: Key | null;
    onInspect?: (variant: Variant, state: VariantStripRenderState) => void;
    getAccessibleLabel?: (variant: Variant, index: number) => string;
    layout?: VariantStripLayout;
    ariaLabel?: string;
    emptyState?: ReactNode;
    className?: string;
}>;
export declare function VariantStrip<Variant>(
    props: VariantStripProps<Variant>
): JSX.Element;
