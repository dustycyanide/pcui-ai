import * as React from 'react';

export type VariantStripLayout = 'cards' | 'compact';

export type VariantStripRenderState = Readonly<{
    id: React.Key
    index: number
    layout: VariantStripLayout
    chosen: boolean
    inspected: boolean
    previewing: boolean
}>;

export type VariantStripProps<Variant> = Readonly<{
    variants: readonly Variant[]
    getId: (variant: Variant, index: number) => React.Key
    /** Presentational body. Put interactive controls in renderActions. */
    renderContent: (
        variant: Variant,
        state: VariantStripRenderState
    ) => React.ReactNode
    renderActions?: (
        variant: Variant,
        state: VariantStripRenderState
    ) => React.ReactNode
    chosenId?: React.Key | null
    inspectedId?: React.Key | null
    previewId?: React.Key | null
    onInspect?: (variant: Variant, state: VariantStripRenderState) => void
    getAccessibleLabel?: (variant: Variant, index: number) => string
    layout?: VariantStripLayout
    ariaLabel?: string
    emptyState?: React.ReactNode
    className?: string
}>;

function sameId(left: React.Key | null | undefined, right: React.Key): boolean {
    return left !== null && left !== undefined && Object.is(left, right);
}

/**
 * Generic variant collection with application-owned content and actions.
 *
 * The strip owns only layout and selection state. Preview players, asset
 * metadata, and mutation controls stay in the consuming application through
 * the render callbacks.
 *
 * @param props - Variants, state identifiers, and application renderers.
 */
export function VariantStrip<Variant>(props: VariantStripProps<Variant>) {
    const {
        variants,
        getId,
        renderContent,
        renderActions,
        chosenId,
        inspectedId,
        previewId,
        onInspect,
        getAccessibleLabel,
        layout = 'cards',
        ariaLabel = 'Variants',
        emptyState = null,
        className
    } = props;
    const stripClasses = [
        'pcui-ai-variant-strip',
        `pcui-ai-variant-strip--${layout}`,
        className
    ].filter(Boolean).join(' ');

    if (variants.length === 0) {
        return (
            <div className={`${stripClasses} pcui-ai-variant-strip--empty`}>
                {emptyState}
            </div>
        );
    }

    return (
        <ol className={stripClasses} aria-label={ariaLabel}>
            {variants.map((variant, index) => {
                const id = getId(variant, index);
                const state: VariantStripRenderState = {
                    id,
                    index,
                    layout,
                    chosen: sameId(chosenId, id),
                    inspected: sameId(inspectedId, id),
                    previewing: sameId(previewId, id)
                };
                const itemClasses = [
                    'pcui-ai-variant',
                    state.chosen && 'is-chosen',
                    state.inspected && 'is-inspected',
                    state.previewing && 'is-previewing'
                ].filter(Boolean).join(' ');
                const accessibleLabel = getAccessibleLabel?.(variant, index) ?? String(id);
                const surface = (
                    <>
                        <div className="pcui-ai-variant__top">
                            <span className="pcui-ai-variant__number" aria-hidden="true">
                                #{String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="pcui-ai-variant__badges">
                                {state.chosen ? (
                                    <span className="pcui-ai-variant__badge">Chosen</span>
                                ) : null}
                                {state.previewing ? (
                                    <span className="pcui-ai-variant__badge">Previewing</span>
                                ) : null}
                            </span>
                        </div>
                        <div className="pcui-ai-variant__content">
                            {renderContent(variant, state)}
                        </div>
                    </>
                );

                return (
                    <li
                        className={itemClasses}
                        data-variant-id={String(id)}
                        key={id}
                    >
                        {onInspect ? (
                            <button
                                className="pcui-ai-variant__surface"
                                type="button"
                                aria-label={`Inspect ${accessibleLabel}`}
                                aria-pressed={state.inspected}
                                onClick={() => onInspect(variant, state)}
                            >
                                {surface}
                            </button>
                        ) : (
                            <article className="pcui-ai-variant__surface">
                                {surface}
                            </article>
                        )}
                        {renderActions ? (
                            <div className="pcui-ai-variant__actions">
                                {renderActions(variant, state)}
                            </div>
                        ) : null}
                    </li>
                );
            })}
        </ol>
    );
}
