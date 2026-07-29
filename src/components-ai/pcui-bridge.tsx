import type { History, Observer } from '@playcanvas/observer';
import React, {
    useLayoutEffect,
    useMemo,
    useRef,
    type HTMLAttributes,
    type ReactNode
} from 'react';
import { createPortal } from 'react-dom';

import {
    BindingElementToObservers,
    BindingObserversToElement,
    BindingTwoWay,
    type BindingBaseArgs
} from '../binding';
import {
    BooleanInput,
    ColorPicker,
    Element as PcuiElement,
    NumericInput,
    Panel,
    SelectInput,
    TextAreaInput,
    VectorInput
} from '../components';

export type PcuiHandler<T extends PcuiElement> = (
    element: T,
    ...args: unknown[]
) => void;

export type PcuiHandlers<T extends PcuiElement> = Readonly<
    Record<string, PcuiHandler<T> | undefined>
>;

export type PcuiBridgeProps<
    T extends PcuiElement,
    Values extends object
> = Readonly<{
    create: () => T
    values: Values
    sync: (element: T, next: Values, previous: Values | undefined) => void
    equal?: (next: Values, previous: Values) => boolean
    events?: PcuiHandlers<T>
    className?: string
    ariaLabel?: string
}>;

function shallowEqual<Values extends object>(
    next: Values,
    previous: Values
): boolean {
    const nextKeys = Object.keys(next) as Array<keyof Values>;
    const previousKeys = Object.keys(previous) as Array<keyof Values>;
    return nextKeys.length === previousKeys.length &&
        nextKeys.every(key => Object.is(next[key], previous[key]));
}

/**
 * A lifecycle boundary between React and an imperative PCUI element.
 *
 * The PCUI instance and its event subscriptions are created once per mount.
 * Event callbacks proxy through refs so rerenders do not leave the imperative
 * element holding stale closures. Values are diffed before the element-specific
 * synchronization callback runs.
 * @param root0 - The bridge properties.
 * @param root0.create - Creates the imperative PCUI element.
 * @param root0.values - Values synchronized into the element.
 * @param root0.sync - Synchronizes changed values into the element.
 * @param root0.equal - Optional values equality function.
 * @param root0.events - Optional PCUI event handlers.
 * @param root0.className - Optional class for the bridge host.
 * @param root0.ariaLabel - Optional accessible label for the bridge host.
 */
function PcuiBridge<T extends PcuiElement, Values extends object>({
    create,
    values,
    sync,
    equal = shallowEqual,
    events,
    className,
    ariaLabel
}: PcuiBridgeProps<T, Values>) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const elementRef = useRef<T | null>(null);
    const previousRef = useRef<Values | undefined>(undefined);
    const createRef = useRef(create);
    const syncRef = useRef(sync);
    const equalRef = useRef(equal);
    const handlersRef = useRef(events);

    createRef.current = create;
    syncRef.current = sync;
    equalRef.current = equal;
    handlersRef.current = events;

    useLayoutEffect(() => {
        const host = hostRef.current;
        if (host === null) return undefined;

        const element = createRef.current();
        const handles = Object.keys(handlersRef.current ?? {}).map(eventName => element.on(eventName, (...args: unknown[]) => {
            handlersRef.current?.[eventName]?.(element, ...args);
        })
        );

        elementRef.current = element;
        host.replaceChildren(element.dom);

        return () => {
            previousRef.current = undefined;
            elementRef.current = null;
            for (const handle of handles) handle.unbind();
            element.destroy();
            host.replaceChildren();
        };
    }, []);

    useLayoutEffect(() => {
        const element = elementRef.current;
        if (element === null) return;

        const previous = previousRef.current;
        if (previous === undefined || !equalRef.current(values, previous)) {
            syncRef.current(element, values, previous);
            previousRef.current = values;
        }
    });

    const hostClasses = ['pcui-ai-bridge', className].filter(Boolean).join(' ');
    const hostProps: HTMLAttributes<HTMLDivElement> = {
        className: hostClasses,
        'aria-label': ariaLabel
    };
    return <div ref={hostRef} {...hostProps} />;
}

type BoundTextAreaValues = Readonly<{
    observer: Observer
    path: string
    placeholder: string
    enabled: boolean
    readOnly: boolean
}>;

function syncBoundTextArea(
    element: TextAreaInput,
    next: BoundTextAreaValues,
    previous: BoundTextAreaValues | undefined
): void {
    if (
        previous?.observer !== next.observer ||
        previous?.path !== next.path
    ) {
        element.link(next.observer, next.path);
    }
    if (previous?.placeholder !== next.placeholder) {
        element.placeholder = next.placeholder;
    }
    if (previous?.enabled !== next.enabled) element.enabled = next.enabled;
    if (previous?.readOnly !== next.readOnly) element.readOnly = next.readOnly;
}

export type PcuiBoundTextAreaProps = Readonly<{
    observer: Observer
    path: string
    history: History
    placeholder?: string
    enabled?: boolean
    readOnly?: boolean
    historyName?: string
    className?: string
    inputClassName?: string
    ariaLabel?: string
    resizable?: 'horizontal' | 'vertical' | 'both' | 'none'
}>;

function PcuiBoundTextArea({
    observer,
    path,
    history,
    placeholder = '',
    enabled = true,
    readOnly = false,
    historyName = `Edit ${path}`,
    className,
    inputClassName,
    ariaLabel = path,
    resizable = 'none'
}: PcuiBoundTextAreaProps) {
    const create = useMemo(
        () => () => {
            const element = new TextAreaInput({
                binding: new BindingTwoWay({ history, historyName }),
                class: ['pcui-ai-bound-textarea__input', inputClassName]
                .filter(Boolean) as string[],
                resizable
            });
            element.dom
            .querySelector('textarea')
            ?.setAttribute('aria-label', ariaLabel);
            return element;
        },
        [ariaLabel, history, historyName, inputClassName, resizable]
    );
    const values = useMemo(
        () => ({ observer, path, placeholder, enabled, readOnly }),
        [enabled, observer, path, placeholder, readOnly]
    );

    return (
        <PcuiBridge
            create={create}
            values={values}
            sync={syncBoundTextArea}
            className={['pcui-ai-bound-textarea', className]
            .filter(Boolean)
            .join(' ')}
            ariaLabel={ariaLabel}
        />
    );
}

type BoundElementValues = Readonly<{
    observer: Observer
    path: string
    enabled: boolean
    readOnly: boolean
}>;

type BoundElement =
    | BooleanInput
    | ColorPicker
    | NumericInput
    | SelectInput
    | VectorInput;

function syncBoundElement<T extends BoundElement>(
    element: T,
    next: BoundElementValues,
    previous: BoundElementValues | undefined
): void {
    if (
        previous?.observer !== next.observer ||
        previous?.path !== next.path
    ) {
        element.link(next.observer, next.path);
    }
    if (previous?.enabled !== next.enabled) element.enabled = next.enabled;
    if (previous?.readOnly !== next.readOnly) element.readOnly = next.readOnly;
}

function boundValues(
    observer: Observer,
    path: string,
    enabled: boolean,
    readOnly: boolean
): BoundElementValues {
    return { observer, path, enabled, readOnly };
}

function boundInputBinding(
    history: History,
    historyName: string
): BindingTwoWay {
    return new BindingTwoWay({ history, historyName });
}

export type PcuiBoundNumericInputProps = Readonly<{
    observer: Observer
    path: string
    history: History
    min?: number | null
    max?: number | null
    step?: number
    precision?: number
    enabled?: boolean
    readOnly?: boolean
    historyName?: string
}>;

function PcuiBoundNumericInput({
    observer,
    path,
    history,
    min = null,
    max = null,
    step = 1,
    precision = 7,
    enabled = true,
    readOnly = false,
    historyName = `Edit ${path}`
}: PcuiBoundNumericInputProps) {
    const create = useMemo(
        () => () => new NumericInput({
            binding: boundInputBinding(history, historyName),
            allowNull: false,
            hideSlider: false,
            renderChanges: true
        }),
        [history, historyName]
    );
    const values = useMemo(
        () => ({
            ...boundValues(observer, path, enabled, readOnly),
            min,
            max,
            step,
            precision
        }),
        [enabled, max, min, observer, path, precision, readOnly, step]
    );

    return (
        <PcuiBridge
            create={create}
            values={values}
            sync={(element, next, previous) => {
                if (previous?.min !== next.min) {
                    element.min = next.min as number;
                }
                if (previous?.max !== next.max) {
                    element.max = next.max as number;
                }
                if (previous?.step !== next.step) element.step = next.step;
                if (previous?.precision !== next.precision) {
                    element.precision = next.precision;
                }
                syncBoundElement(element, next, previous);
            }}
            className="pcui-ai-auto-inspector__input pcui-ai-auto-inspector__input--number"
            ariaLabel={path}
        />
    );
}

export type PcuiBoundVectorInputProps = Readonly<{
    observer: Observer
    path: string
    history: History
    min?: number | null
    max?: number | null
    step?: number
    precision?: number
    enabled?: boolean
    readOnly?: boolean
    historyName?: string
}>;

function PcuiBoundVectorInput({
    observer,
    path,
    history,
    min = null,
    max = null,
    step = 1,
    precision = 7,
    enabled = true,
    readOnly = false,
    historyName = `Edit ${path}`
}: PcuiBoundVectorInputProps) {
    const create = useMemo(
        () => () => new VectorInput({
            binding: boundInputBinding(history, historyName),
            dimensions: 3,
            renderChanges: true
        }),
        [history, historyName]
    );
    const values = useMemo(
        () => ({
            ...boundValues(observer, path, enabled, readOnly),
            min,
            max,
            step,
            precision
        }),
        [enabled, max, min, observer, path, precision, readOnly, step]
    );

    return (
        <PcuiBridge
            create={create}
            values={values}
            sync={(element, next, previous) => {
                if (previous?.min !== next.min) {
                    element.min = next.min as number;
                }
                if (previous?.max !== next.max) {
                    element.max = next.max as number;
                }
                if (previous?.step !== next.step) element.step = next.step;
                if (previous?.precision !== next.precision) {
                    element.precision = next.precision;
                }
                syncBoundElement(element, next, previous);
            }}
            className="pcui-ai-auto-inspector__input pcui-ai-auto-inspector__input--vector"
            ariaLabel={path}
        />
    );
}

export type PcuiSelectValue = boolean | number | string;
export type PcuiSelectOption = Readonly<{ t: string, v: PcuiSelectValue }>;

export type PcuiBoundSelectInputProps = Readonly<{
    observer: Observer
    path: string
    history: History
    options: readonly PcuiSelectOption[]
    valueType: 'boolean' | 'number' | 'string'
    enabled?: boolean
    readOnly?: boolean
    historyName?: string
}>;

function PcuiBoundSelectInput({
    observer,
    path,
    history,
    options,
    valueType,
    enabled = true,
    readOnly = false,
    historyName = `Edit ${path}`
}: PcuiBoundSelectInputProps) {
    const create = useMemo(
        () => () => new SelectInput({
            binding: boundInputBinding(history, historyName),
            allowInput: false,
            allowCreate: false,
            type: valueType
        }),
        [history, historyName, valueType]
    );
    const optionsSignature = JSON.stringify(options);
    const values = useMemo(
        () => ({
            ...boundValues(observer, path, enabled, readOnly),
            options,
            optionsSignature
        }),
        [enabled, observer, options, optionsSignature, path, readOnly]
    );

    return (
        <PcuiBridge
            create={create}
            values={values}
            equal={(next, previous) => next.observer === previous.observer &&
                next.path === previous.path &&
                next.enabled === previous.enabled &&
                next.readOnly === previous.readOnly &&
                next.optionsSignature === previous.optionsSignature
            }
            sync={(element, next, previous) => {
                if (previous?.optionsSignature !== next.optionsSignature) {
                    element.options = next.options.map(option => ({ ...option }));
                }
                syncBoundElement(element, next, previous);
            }}
            className="pcui-ai-auto-inspector__input pcui-ai-auto-inspector__input--select"
            ariaLabel={path}
        />
    );
}

export type PcuiBoundBooleanInputProps = Readonly<{
    observer: Observer
    path: string
    history: History
    enabled?: boolean
    readOnly?: boolean
    historyName?: string
}>;

function PcuiBoundBooleanInput({
    observer,
    path,
    history,
    enabled = true,
    readOnly = false,
    historyName = `Edit ${path}`
}: PcuiBoundBooleanInputProps) {
    const create = useMemo(
        () => () => new BooleanInput({
            binding: boundInputBinding(history, historyName),
            renderChanges: true,
            type: 'toggle'
        }),
        [history, historyName]
    );
    const values = useMemo(
        () => boundValues(observer, path, enabled, readOnly),
        [enabled, observer, path, readOnly]
    );

    return (
        <PcuiBridge
            create={create}
            values={values}
            sync={syncBoundElement}
            className="pcui-ai-auto-inspector__input pcui-ai-auto-inspector__input--boolean"
            ariaLabel={path}
        />
    );
}

function hexToRgb(value: unknown): number[] {
    const match = typeof value === 'string' ?
        /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value) :
        null;
    if (!match) return [0, 0, 0];
    return match.slice(1).map(channel => Number.parseInt(channel, 16) / 255);
}

function rgbToHex(value: unknown): string {
    const channels = Array.isArray(value) ? value.slice(0, 3) : [];
    while (channels.length < 3) channels.push(0);
    return `#${channels
    .map(channel => Math.round(Math.max(0, Math.min(1, Number(channel) || 0)) * 255)
    .toString(16)
    .padStart(2, '0')
    )
    .join('')}`;
}

class HexColorElementToObservers extends BindingElementToObservers {
    constructor(private readonly args: Readonly<BindingBaseArgs>) {
        super(args);
    }

    override clone(): BindingElementToObservers {
        return new HexColorElementToObservers(this.args);
    }

    override setValue(value: unknown): void {
        super.setValue(rgbToHex(value));
    }

    override setValues(values: unknown[]): void {
        super.setValues(values.map(rgbToHex));
    }
}

function hexColorBinding(
    history: History,
    historyName: string
): BindingTwoWay {
    const args = { history, historyName };
    return new BindingTwoWay({
        ...args,
        bindingElementToObservers: new HexColorElementToObservers(args),
        bindingObserversToElement: new BindingObserversToElement({
            customUpdate: (element, observers, paths) => {
                element.value = hexToRgb(observers[0]?.get(paths[0]));
            }
        })
    });
}

export type PcuiBoundColorPickerProps = Readonly<{
    observer: Observer
    path: string
    history: History
    enabled?: boolean
    readOnly?: boolean
    historyName?: string
}>;

function PcuiBoundColorPicker({
    observer,
    path,
    history,
    enabled = true,
    readOnly = false,
    historyName = `Edit ${path}`
}: PcuiBoundColorPickerProps) {
    const create = useMemo(
        () => () => new ColorPicker({
            binding: hexColorBinding(history, historyName),
            channels: 3,
            renderChanges: true
        }),
        [history, historyName]
    );
    const values = useMemo(
        () => boundValues(observer, path, enabled, readOnly),
        [enabled, observer, path, readOnly]
    );

    return (
        <PcuiBridge
            create={create}
            values={values}
            sync={syncBoundElement}
            className="pcui-ai-auto-inspector__input pcui-ai-auto-inspector__input--color"
            ariaLabel={path}
        />
    );
}

type PanelValues = Readonly<{
    title: string
    collapsed: boolean
    enabled: boolean
}>;

export type PcuiCollapsiblePanelProps = Readonly<{
    title: string
    children: ReactNode
    collapsed?: boolean
    enabled?: boolean
}>;

function PcuiCollapsiblePanel({
    title,
    children,
    collapsed = false,
    enabled = true
}: PcuiCollapsiblePanelProps) {
    const contentHost = useMemo(() => {
        if (typeof document === 'undefined') return null;
        const host = document.createElement('div');
        host.className = 'pcui-ai-auto-inspector__panel-content';
        return host;
    }, []);
    const create = useMemo(
        () => () => new Panel({
            collapsible: true,
            collapsed,
            content: contentHost ?? undefined,
            headerText: title
        }),
        [collapsed, contentHost, title]
    );
    const values = useMemo(
        () => ({ title, collapsed, enabled }),
        [collapsed, enabled, title]
    );

    return (
        <>
            <PcuiBridge
                create={create}
                values={values}
                sync={(element, next, previous) => {
                    if (previous?.title !== next.title) {
                        element.headerText = next.title;
                    }
                    if (previous?.collapsed !== next.collapsed) {
                        element.collapsed = next.collapsed;
                    }
                    if (previous?.enabled !== next.enabled) {
                        element.enabled = next.enabled;
                    }
                }}
                className="pcui-ai-auto-inspector__panel"
                ariaLabel={title}
            />
            {contentHost ? createPortal(children, contentHost) : null}
        </>
    );
}

export {
    PcuiBoundBooleanInput,
    PcuiBoundColorPicker,
    PcuiBoundNumericInput,
    PcuiBoundSelectInput,
    PcuiBoundTextArea,
    PcuiBoundVectorInput,
    PcuiBridge,
    PcuiCollapsiblePanel
};
