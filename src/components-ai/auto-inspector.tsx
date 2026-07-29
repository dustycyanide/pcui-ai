import { History, Observer, ObserverHistory } from '@playcanvas/observer';
import React, {
    useEffect,
    useMemo,
    useRef,
    type ReactNode
} from 'react';

import {
    PcuiBoundBooleanInput,
    PcuiBoundColorPicker,
    PcuiBoundNumericInput,
    PcuiBoundSelectInput,
    PcuiBoundVectorInput,
    PcuiCollapsiblePanel
} from './pcui-bridge';

export type JsonSchemaScalar = boolean | number | string | null;
export type JsonSchemaType =
    | 'array'
    | 'boolean'
    | 'integer'
    | 'null'
    | 'number'
    | 'object'
    | 'string';

/**
 * The JSON Schema surface AutoInspector understands. Unsupported keywords are
 * deliberately absent: adding one here means deciding how it maps to an input.
 */
export type JsonSchema = Readonly<{
    $ref?: string
    $defs?: Readonly<Record<string, JsonSchema>>
    definitions?: Readonly<Record<string, JsonSchema>>
    title?: string
    description?: string
    type?: JsonSchemaType | readonly JsonSchemaType[]
    const?: unknown
    enum?: readonly JsonSchemaScalar[]
    properties?: Readonly<Record<string, JsonSchema>>
    additionalProperties?: boolean | JsonSchema
    items?: JsonSchema | readonly JsonSchema[]
    minItems?: number
    maxItems?: number
    minimum?: number
    maximum?: number
    exclusiveMinimum?: number
    exclusiveMaximum?: number
    multipleOf?: number
    pattern?: string
    format?: string
    readOnly?: boolean
}>;

export type AutoInspectorChange = Readonly<{
    /** RFC 6901 JSON Pointer. */
    pointer: string
    /** Dot-delimited path accepted by @playcanvas/observer. */
    path: string
    oldValue: unknown
    newValue: unknown
}>;

export type AutoInspectorProps = Readonly<{
    schema: JsonSchema
    observer: Observer
    history?: History
    onChange?: (change: AutoInspectorChange) => void
    enabled?: boolean
    className?: string
}>;

type InspectorFieldProps = Readonly<{
    rootSchema: JsonSchema
    schema: JsonSchema
    observer: Observer
    history: History
    path: string
    name: string
    enabled: boolean
    parentReadOnly: boolean
}>;

type PendingVectorChange = {
    oldValue: unknown
    oldValueFromRoot: boolean
};

const COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';

function cloneJson(value: unknown): unknown {
    const jsonValue = value instanceof Observer ? value.json() : value;
    return structuredClone(jsonValue);
}

function humanize(value: string): string {
    return value
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, character => character.toUpperCase());
}

function joinPath(parent: string, child: string): string {
    return parent ? `${parent}.${child}` : child;
}

function observerPathToJsonPointer(path: string): string {
    if (!path) return '';
    return `/${path
    .split('.')
    .map(part => part.replace(/~/g, '~0').replace(/\//g, '~1'))
    .join('/')}`;
}

function resolvePointer(rootSchema: JsonSchema, pointer: string): unknown {
    if (!pointer.startsWith('#/')) return undefined;
    let value: unknown = rootSchema;
    for (const encodedPart of pointer.slice(2).split('/')) {
        const part = encodedPart.replace(/~1/g, '/').replace(/~0/g, '~');
        if (value === null || typeof value !== 'object') return undefined;
        value = (value as Record<string, unknown>)[part];
    }
    return value;
}

function resolveSchema(rootSchema: JsonSchema, schema: JsonSchema): JsonSchema {
    let resolved = schema;
    const visited = new Set<string>();
    while (resolved.$ref && !visited.has(resolved.$ref)) {
        visited.add(resolved.$ref);
        const target = resolvePointer(rootSchema, resolved.$ref);
        if (target === null || typeof target !== 'object' || Array.isArray(target)) {
            break;
        }
        resolved = {
            ...(target as JsonSchema),
            ...resolved,
            $ref: undefined
        };
    }
    return resolved;
}

function schemaHasType(schema: JsonSchema, type: JsonSchemaType): boolean {
    return Array.isArray(schema.type) ?
        schema.type.includes(type) :
        schema.type === type;
}

function numericItemSchema(
    rootSchema: JsonSchema,
    schema: JsonSchema
): JsonSchema | undefined {
    if (Array.isArray(schema.items) || schema.items === undefined) return undefined;
    const items = resolveSchema(rootSchema, schema.items as JsonSchema);
    return schemaHasType(items, 'number') || schemaHasType(items, 'integer') ?
        items :
        undefined;
}

function isVec3Schema(rootSchema: JsonSchema, schema: JsonSchema): boolean {
    if (!schemaHasType(schema, 'array')) return false;
    if (schema.minItems !== 3 || schema.maxItems !== 3) return false;
    return numericItemSchema(rootSchema, schema) !== undefined;
}

function isColorSchema(schema: JsonSchema): boolean {
    return schemaHasType(schema, 'string') &&
        (schema.format === 'color' ||
            schema.format === 'hex-color' ||
            schema.pattern === COLOR_PATTERN);
}

function numericPrecision(schema: JsonSchema): number {
    if (schemaHasType(schema, 'integer')) return 0;
    const step = schema.multipleOf;
    if (step === undefined || !Number.isFinite(step)) return 7;
    const text = step.toString().toLowerCase();
    if (text.includes('e-')) return Number(text.split('e-')[1]) || 7;
    return Math.min(12, text.split('.')[1]?.length ?? 0);
}

function numericStep(schema: JsonSchema): number {
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
        return schema.multipleOf;
    }
    return schemaHasType(schema, 'integer') ? 1 : 0.01;
}

function numericMinimum(schema: JsonSchema): number | null {
    return schema.minimum ?? schema.exclusiveMinimum ?? null;
}

function numericMaximum(schema: JsonSchema): number | null {
    return schema.maximum ?? schema.exclusiveMaximum ?? null;
}

function objectAt(observer: Observer, path: string): Record<string, unknown> {
    const value = path ? observer.get(path) : observer.json();
    return value !== null && typeof value === 'object' && !Array.isArray(value) ?
        value as Record<string, unknown> :
        {};
}

function objectFields(
    rootSchema: JsonSchema,
    schema: JsonSchema,
    observer: Observer,
    path: string
): ReadonlyArray<readonly [string, JsonSchema]> {
    const current = objectAt(observer, path);
    const fields: Array<readonly [string, JsonSchema]> = [];
    const included = new Set<string>();

    for (const [name, fieldSchema] of Object.entries(schema.properties ?? {})) {
        if (!(name in current)) continue;
        fields.push([name, fieldSchema]);
        included.add(name);
    }

    if (
        schema.additionalProperties !== undefined &&
        schema.additionalProperties !== false
    ) {
        const additionalSchema = schema.additionalProperties === true ?
            {} as JsonSchema :
            schema.additionalProperties;
        for (const name of Object.keys(current)) {
            if (included.has(name)) continue;
            fields.push([name, additionalSchema]);
        }
    }

    return fields.map(([name, fieldSchema]) => [
        name,
        resolveSchema(rootSchema, fieldSchema)
    ]);
}

type SelectValues = Readonly<{
    type: 'boolean' | 'number' | 'string'
    options: ReadonlyArray<Readonly<{
        t: string
        v: boolean | number | string
    }>>
}>;

function selectValues(schema: JsonSchema): SelectValues | undefined {
    if (!schema.enum || schema.enum.length === 0) return undefined;
    const firstType = typeof schema.enum[0];
    if (
        firstType !== 'boolean' &&
        firstType !== 'number' &&
        firstType !== 'string'
    ) {
        return undefined;
    }
    if (schema.enum.some(value => typeof value !== firstType)) return undefined;
    const type = firstType as 'boolean' | 'number' | 'string';
    return {
        type,
        options: schema.enum.map(value => ({
            t: String(value),
            v: value as boolean | number | string
        }))
    };
}

type FieldShellProps = Readonly<{
    label: string
    description?: string
    path: string
    children: ReactNode
}>;

function FieldShell({
    label,
    description,
    path,
    children
}: FieldShellProps) {
    return (
        <div
            className="pcui-ai-auto-inspector__field"
            data-observer-path={path}
        >
            <div className="pcui-ai-auto-inspector__field-label">{label}</div>
            {description ? (
                <div className="pcui-ai-auto-inspector__field-description">
                    {description}
                </div>
            ) : null}
            {children}
        </div>
    );
}

function InspectorField({
    rootSchema,
    schema: unresolvedSchema,
    observer,
    history,
    path,
    name,
    enabled,
    parentReadOnly
}: InspectorFieldProps) {
    const schema = resolveSchema(rootSchema, unresolvedSchema);
    const label = schema.title ?? humanize(name);
    const readOnly = parentReadOnly || schema.readOnly === true;

    if (schema.const !== undefined) return null;

    const select = selectValues(schema);
    if (select) {
        return (
            <FieldShell label={label} description={schema.description} path={path}>
                <PcuiBoundSelectInput
                    observer={observer}
                    path={path}
                    history={history}
                    options={select.options}
                    valueType={select.type}
                    enabled={enabled}
                    readOnly={readOnly}
                />
            </FieldShell>
        );
    }

    if (isVec3Schema(rootSchema, schema)) {
        const items = numericItemSchema(rootSchema, schema) as JsonSchema;
        return (
            <FieldShell label={label} description={schema.description} path={path}>
                <PcuiBoundVectorInput
                    observer={observer}
                    path={path}
                    history={history}
                    min={numericMinimum(items)}
                    max={numericMaximum(items)}
                    step={numericStep(items)}
                    precision={numericPrecision(items)}
                    enabled={enabled}
                    readOnly={readOnly}
                />
            </FieldShell>
        );
    }

    if (schemaHasType(schema, 'number') || schemaHasType(schema, 'integer')) {
        return (
            <FieldShell label={label} description={schema.description} path={path}>
                <PcuiBoundNumericInput
                    observer={observer}
                    path={path}
                    history={history}
                    min={numericMinimum(schema)}
                    max={numericMaximum(schema)}
                    step={numericStep(schema)}
                    precision={numericPrecision(schema)}
                    enabled={enabled}
                    readOnly={readOnly}
                />
            </FieldShell>
        );
    }

    if (isColorSchema(schema)) {
        return (
            <FieldShell label={label} description={schema.description} path={path}>
                <PcuiBoundColorPicker
                    observer={observer}
                    path={path}
                    history={history}
                    enabled={enabled}
                    readOnly={readOnly}
                />
            </FieldShell>
        );
    }

    if (schemaHasType(schema, 'boolean')) {
        return (
            <FieldShell label={label} description={schema.description} path={path}>
                <PcuiBoundBooleanInput
                    observer={observer}
                    path={path}
                    history={history}
                    enabled={enabled}
                    readOnly={readOnly}
                />
            </FieldShell>
        );
    }

    if (schemaHasType(schema, 'object') || schema.properties !== undefined) {
        const fields = objectFields(rootSchema, schema, observer, path);
        if (fields.length === 0) return null;
        return (
            <PcuiCollapsiblePanel title={label} enabled={enabled}>
                {fields.map(([childName, childSchema]) => {
                    const childPath = joinPath(path, childName);
                    return (
                        <InspectorField
                            key={childPath}
                            rootSchema={rootSchema}
                            schema={childSchema}
                            observer={observer}
                            history={history}
                            path={childPath}
                            name={childName}
                            enabled={enabled}
                            parentReadOnly={readOnly}
                        />
                    );
                })}
            </PcuiCollapsiblePanel>
        );
    }

    return null;
}

function collectVec3Paths(
    rootSchema: JsonSchema,
    schema: JsonSchema,
    observer: Observer,
    path = '',
    paths = new Set<string>()
): Set<string> {
    const resolved = resolveSchema(rootSchema, schema);
    if (isVec3Schema(rootSchema, resolved)) {
        paths.add(path);
        return paths;
    }
    if (schemaHasType(resolved, 'object') || resolved.properties !== undefined) {
        for (const [name, childSchema] of objectFields(
            rootSchema,
            resolved,
            observer,
            path
        )) {
            collectVec3Paths(
                rootSchema,
                childSchema,
                observer,
                joinPath(path, name),
                paths
            );
        }
    }
    return paths;
}

function vectorPathFor(
    rawPath: string,
    vectorPaths: ReadonlySet<string>
): string | undefined {
    if (vectorPaths.has(rawPath)) return rawPath;
    const match = /^(.*)\.[0-2]$/.exec(rawPath);
    return match && vectorPaths.has(match[1]) ? match[1] : undefined;
}

function oldVectorValue(
    observer: Observer,
    rawPath: string,
    vectorPath: string,
    oldValue: unknown
): unknown {
    if (rawPath === vectorPath) return cloneJson(oldValue);
    const current = observer.get(vectorPath);
    if (!Array.isArray(current)) return cloneJson(oldValue);
    const restored = cloneJson(current) as unknown[];
    const index = Number(rawPath.slice(vectorPath.length + 1));
    restored[index] = cloneJson(oldValue);
    return restored;
}

/**
 * Schema-driven vanilla PCUI controls over a PlayCanvas Observer.
 *
 * BindingTwoWay records edits directly in the supplied History. The installed
 * ObserverHistory catches non-PCUI edits while PCUI temporarily disables it,
 * preventing duplicate actions. Undo and redo still emit Observer changes, so
 * onChange sees the same normalized path/value contract in both directions.
 * @param root0 - The inspector properties.
 * @param root0.schema - The supported JSON Schema surface to render.
 * @param root0.observer - The Observer containing editable values.
 * @param root0.history - Optional shared undo and redo history.
 * @param root0.onChange - Optional normalized change callback.
 * @param root0.enabled - Whether generated controls are enabled.
 * @param root0.className - Optional additional class for the inspector root.
 */
function AutoInspector({
    schema,
    observer,
    history,
    onChange,
    enabled = true,
    className
}: AutoInspectorProps) {
    const ownedHistory = useMemo(() => new History(), []);
    const activeHistory = history ?? ownedHistory;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const resolvedRoot = useMemo(() => resolveSchema(schema, schema), [schema]);
    const rootFields = useMemo(
        () => objectFields(resolvedRoot, resolvedRoot, observer, ''),
        [observer, resolvedRoot]
    );
    const vectorPaths = useMemo(
        () => collectVec3Paths(resolvedRoot, resolvedRoot, observer),
        [observer, resolvedRoot]
    );

    useEffect(() => {
        const observerWithOptionalHistory = observer as unknown as {
            history?: ObserverHistory
        };
        const priorHistory = observerWithOptionalHistory.history;
        const observerHistory = new ObserverHistory({
            item: observer,
            history: activeHistory,
            prefix: 'Edit '
        });
        observerWithOptionalHistory.history = observerHistory;

        return () => {
            observerHistory.destroy();
            if (priorHistory === undefined) {
                delete observerWithOptionalHistory.history;
            } else {
                observerWithOptionalHistory.history = priorHistory;
            }
        };
    }, [activeHistory, observer]);

    useEffect(() => {
        const pendingVectors = new Map<string, PendingVectorChange>();
        let flushQueued = false;

        const emit = (path: string, oldValue: unknown, newValue: unknown) => {
            onChangeRef.current?.({
                pointer: observerPathToJsonPointer(path),
                path,
                oldValue: cloneJson(oldValue),
                newValue: cloneJson(newValue)
            });
        };

        const flushVectors = () => {
            flushQueued = false;
            for (const [path, pending] of pendingVectors) {
                emit(path, pending.oldValue, observer.get(path));
            }
            pendingVectors.clear();
        };

        const record = (
            rawPath: string,
            oldValue: unknown,
            newValue: unknown
        ) => {
            const vectorPath = vectorPathFor(rawPath, vectorPaths);
            if (vectorPath === undefined) {
                emit(rawPath, oldValue, newValue);
                return;
            }

            const oldValueFromRoot = rawPath === vectorPath;
            const prior = pendingVectors.get(vectorPath);
            if (!prior || (oldValueFromRoot && !prior.oldValueFromRoot)) {
                pendingVectors.set(vectorPath, {
                    oldValue: oldVectorValue(observer, rawPath, vectorPath, oldValue),
                    oldValueFromRoot
                });
            }
            if (!flushQueued) {
                flushQueued = true;
                queueMicrotask(flushVectors);
            }
        };

        const setHandle = observer.on(
            '*:set',
            (path: string, value: unknown, oldValue: unknown) => {
                record(path, oldValue, value);
            }
        );
        const unsetHandle = observer.on(
            '*:unset',
            (path: string, oldValue: unknown) => {
                record(path, oldValue, undefined);
            }
        );

        return () => {
            setHandle.unbind();
            unsetHandle.unbind();
            pendingVectors.clear();
        };
    }, [observer, vectorPaths]);

    useEffect(
        () => () => {
            if (history === undefined) ownedHistory.clear();
        },
        [history, ownedHistory]
    );

    const classes = ['pcui-ai-auto-inspector', className]
    .filter(Boolean)
    .join(' ');
    return (
        <div className={classes}>
            {rootFields.map(([name, fieldSchema]) => {
                const path = name;
                return (
                    <InspectorField
                        key={path}
                        rootSchema={resolvedRoot}
                        schema={fieldSchema}
                        observer={observer}
                        history={activeHistory}
                        path={path}
                        name={name}
                        enabled={enabled}
                        parentReadOnly={resolvedRoot.readOnly === true}
                    />
                );
            })}
        </div>
    );
}

export { AutoInspector, observerPathToJsonPointer };
