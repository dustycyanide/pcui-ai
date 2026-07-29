import * as React from 'react';

import {
    type AgentChatCopy,
    type AgentChatPanelProps,
    type AgentEntry,
    type AgentEvent,
    type AgentRun,
    type AgentState
} from './agent-chat-types';

type AgentView = Readonly<{
    entries: readonly AgentEntry[];
    run: AgentRun | null;
    sequence: number;
    loading: boolean;
    connected: boolean;
    error: string | null;
}>;

const EMPTY_VIEW: AgentView = {
    entries: [],
    run: null,
    sequence: 0,
    loading: true,
    connected: false,
    error: null
};

const DEFAULT_COPY: AgentChatCopy = {
    panelLabel: contextLabel => `Agent for ${contextLabel}`,
    conversationLabel: contextLabel => `Conversation with the agent for ${contextLabel}`,
    composerLabel: contextLabel => `Message the agent for ${contextLabel}`,
    contextEyebrow: 'Agent',
    loadingConversation: 'Loading conversation…',
    emptyTitle: 'Start a conversation.',
    emptyBody: 'Describe one clear request.',
    ready: 'Ready',
    sending: 'Sending…',
    queued: 'Queued',
    queuePosition: position => `Queued · #${position}`,
    working: 'Working…',
    needsAttention: 'Needs attention',
    live: 'live',
    connecting: 'connecting',
    sync: 'Sync',
    userName: 'You',
    assistantName: 'Agent',
    composerPlaceholder: 'Describe what should change…',
    send: 'Send',
    composerHint: 'Enter sends · Shift+Enter adds a line',
    stateUnavailable: 'Agent state unavailable',
    messageNotQueued: 'Message was not queued'
};

function viewFromState<Context extends string>(state: AgentState<Context>): AgentView {
    return {
        entries: state.entries,
        run: state.run,
        sequence: state.sequence,
        loading: false,
        connected: false,
        error: null
    };
}

function upsertEntry(
    entries: readonly AgentEntry[],
    entry: AgentEntry
): readonly AgentEntry[] {
    const index = entries.findIndex(candidate => candidate.id === entry.id);
    if (index < 0) return [...entries, entry];
    const next = [...entries];
    next[index] = entry;
    return next;
}

function reduceAgentEvent<Context extends string>(
    view: AgentView,
    event: AgentEvent<Context>
): AgentView {
    if (event.seq <= view.sequence) return view;
    const base: AgentView = {
        ...view,
        sequence: event.seq,
        loading: false,
        error: null
    };

    if (event.type === 'entry') {
        return { ...base, entries: upsertEntry(view.entries, event.entry) };
    }
    if (event.type === 'run') return { ...base, run: event.run };
    if (event.type === 'activity') {
        return {
            ...base,
            entries: upsertEntry(view.entries, {
                id: `activity-${event.seq}`,
                type: 'notice',
                text: event.label,
                createdAt: new Date().toISOString()
            })
        };
    }
    return { ...base, error: event.message };
}

function runLabel(
    run: AgentRun | null,
    submitting: boolean,
    copy: AgentChatCopy
): string {
    if (submitting) return copy.sending;
    if (!run) return copy.ready;
    if (run.status === 'queued') {
        return run.queuePosition === null ?
            copy.queued :
            copy.queuePosition(run.queuePosition);
    }
    if (run.status === 'running') return copy.working;
    if (run.status === 'error') return copy.needsAttention;
    return copy.ready;
}

/**
 * Context-aware streamed agent conversation with application-injected I/O.
 *
 * @param props - Conversation context, transport, modes, and presentation copy.
 */
export function AgentChatPanel<
    Context extends string = string,
    Mode extends string = string
>(props: AgentChatPanelProps<Context, Mode>) {
    const {
        context,
        contextLabel,
        transport,
        defaultMode,
        modeToggle,
        copy: copyOverrides,
        className
    } = props;
    const [views, setViews] = React.useState<Record<string, AgentView>>({});
    const [drafts, setDrafts] = React.useState<Record<string, string>>({});
    const [alternateModes, setAlternateModes] = React.useState<Record<string, boolean>>({});
    const [submittingContexts, setSubmittingContexts] = React.useState<Record<string, boolean>>({});
    const [reloadVersion, setReloadVersion] = React.useState(0);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const stickToBottomByContext = React.useRef<Record<string, boolean>>({});
    const scrollTopByContext = React.useRef<Record<string, number>>({});

    const copy = React.useMemo(
        () => ({ ...DEFAULT_COPY, ...copyOverrides }),
        [copyOverrides]
    );
    const view = views[context] ?? EMPTY_VIEW;
    const draft = drafts[context] ?? '';
    const alternateMode = alternateModes[context] ?? false;
    const submitting = submittingContexts[context] ?? false;
    const busy = view.run?.status === 'queued' || view.run?.status === 'running';

    React.useEffect(() => {
        const controller = new AbortController();
        let unsubscribe: (() => void) | null = null;
        let disposed = false;
        let transportFailed = false;

        setViews(current => ({
            ...current,
            [context]: {
                ...(current[context] ?? EMPTY_VIEW),
                loading: true,
                connected: false,
                error: null
            }
        }));

        transport.load(context, controller.signal)
        .then((state) => {
            if (disposed || state.context !== context) return;
            setViews(current => ({ ...current, [context]: viewFromState(state) }));
            unsubscribe = transport.subscribe(
                context,
                state.sequence,
                (event) => {
                    if (event.context !== context) return;
                    setViews(current => ({
                        ...current,
                        [context]: reduceAgentEvent(
                            current[context] ?? EMPTY_VIEW,
                            event
                        )
                    }));
                },
                (connected) => {
                    if (disposed) return;
                    if (!connected) transportFailed = true;
                    setViews(current => ({
                        ...current,
                        [context]: {
                            ...(current[context] ?? EMPTY_VIEW),
                            connected
                        }
                    }));
                    if (connected && transportFailed) {
                        transportFailed = false;
                        // A reconnect can cross a server restart. Reloading
                        // establishes a fresh snapshot and sequence cursor.
                        setReloadVersion(value => value + 1);
                    }
                }
            );
        })
        .catch((cause: unknown) => {
            if (disposed || controller.signal.aborted) return;
            setViews(current => ({
                ...current,
                [context]: {
                    ...(current[context] ?? EMPTY_VIEW),
                    loading: false,
                    connected: false,
                    error: cause instanceof Error ?
                        cause.message :
                        copy.stateUnavailable
                }
            }));
        });

        return () => {
            disposed = true;
            controller.abort();
            unsubscribe?.();
        };
    }, [context, copy.stateUnavailable, reloadVersion, transport]);

    const lastEntry = view.entries[view.entries.length - 1];
    React.useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;

        if (stickToBottomByContext.current[context] ?? true) {
            scroll.scrollTop = scroll.scrollHeight;
        } else {
            scroll.scrollTop = scrollTopByContext.current[context] ?? 0;
        }
    }, [context]);

    React.useEffect(() => {
        if (!(stickToBottomByContext.current[context] ?? true)) return;
        const scroll = scrollRef.current;
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }, [context, lastEntry?.id, view.run?.status]);

    const status = runLabel(view.run, submitting, copy);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const message = draft.trim();
        if (!message || submitting || busy) return;

        setSubmittingContexts(current => ({ ...current, [context]: true }));
        setViews(current => ({
            ...current,
            [context]: { ...(current[context] ?? EMPTY_VIEW), error: null }
        }));
        try {
            const mode = alternateMode && modeToggle ?
                modeToggle.mode :
                defaultMode;
            const response = await transport.send(context, message, mode);
            setDrafts(current => ({ ...current, [context]: '' }));
            setAlternateModes(current => ({ ...current, [context]: false }));
            setViews((current) => {
                const active = current[context] ?? EMPTY_VIEW;
                const matchingRun = active.run?.id === response.runId ?
                    active.run :
                    null;
                return {
                    ...current,
                    [context]: {
                        ...active,
                        entries: upsertEntry(active.entries, response.entry),
                        run: matchingRun ?? {
                            id: response.runId,
                            status: 'queued',
                            queuePosition: null
                        }
                    }
                };
            });
            stickToBottomByContext.current[context] = true;
        } catch (cause) {
            setViews(current => ({
                ...current,
                [context]: {
                    ...(current[context] ?? EMPTY_VIEW),
                    error: cause instanceof Error ?
                        cause.message :
                        copy.messageNotQueued
                }
            }));
        } finally {
            setSubmittingContexts(current => ({ ...current, [context]: false }));
        }
    };

    const rootClassName = [
        'pcui-ai-agent-chat',
        className
    ].filter(Boolean).join(' ');

    return (
        <section
            className={rootClassName}
            aria-label={copy.panelLabel(contextLabel)}
        >
            <div className="pcui-ai-agent-chat__context">
                <span>{copy.contextEyebrow}</span>
                <strong>{contextLabel}</strong>
                <small>{context}</small>
            </div>

            <div
                className="pcui-ai-agent-chat__messages"
                ref={scrollRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-label={copy.conversationLabel(contextLabel)}
                aria-busy={busy || submitting}
                onScroll={(event) => {
                    const element = event.currentTarget;
                    scrollTopByContext.current[context] = element.scrollTop;
                    stickToBottomByContext.current[context] =
                        element.scrollHeight - element.scrollTop - element.clientHeight < 72;
                }}
            >
                {view.loading && view.entries.length === 0 ? (
                    <div className="pcui-ai-agent-chat__empty">
                        {copy.loadingConversation}
                    </div>
                ) : view.entries.length === 0 ? (
                    <div className="pcui-ai-agent-chat__empty">
                        <strong>{copy.emptyTitle}</strong>
                        <span>{copy.emptyBody}</span>
                    </div>
                ) : (
                    view.entries.map(entry => (entry.type === 'notice' ? (
                        <div
                            className="pcui-ai-agent-chat__notice"
                            key={entry.id}
                            title={entry.text}
                        >
                            <i aria-hidden="true">↳</i>
                            <span>{entry.text}</span>
                        </div>
                    ) : (
                        <article
                            className={
                                `pcui-ai-agent-chat__message pcui-ai-agent-chat__message--${entry.role}`
                            }
                            key={entry.id}
                        >
                            <small>
                                {entry.role === 'user' ?
                                    copy.userName :
                                    copy.assistantName}
                            </small>
                            <p>{entry.text}</p>
                        </article>
                    )))
                )}
            </div>

            <div
                className="pcui-ai-agent-chat__run"
                role="status"
                aria-live="polite"
            >
                <span
                    className={busy || submitting ? 'is-working' : undefined}
                    aria-hidden="true"
                />
                <strong>{status}</strong>
                <small>{view.connected ? copy.live : copy.connecting}</small>
            </div>
            {view.error && (
                <div className="pcui-ai-agent-chat__error" role="alert">
                    <span>{view.error}</span>
                    <button
                        type="button"
                        onClick={() => setReloadVersion(value => value + 1)}
                    >
                        {copy.sync}
                    </button>
                </div>
            )}

            <form
                className="pcui-ai-agent-chat__composer"
                onSubmit={submit}
            >
                <textarea
                    aria-label={copy.composerLabel(contextLabel)}
                    value={draft}
                    disabled={busy || submitting}
                    placeholder={copy.composerPlaceholder}
                    rows={3}
                    onChange={(event) => {
                        const value = event.target.value;
                        setDrafts(current => ({ ...current, [context]: value }));
                    }}
                    onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                        if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                        }
                    }}
                />
                <div
                    className={
                        `pcui-ai-agent-chat__composer-actions${
                            modeToggle ? '' : ' pcui-ai-agent-chat__composer-actions--send-only'
                        }`
                    }
                >
                    {modeToggle && (
                        <button
                            className={
                                `pcui-ai-agent-chat__mode${alternateMode ? ' is-active' : ''}`
                            }
                            type="button"
                            aria-pressed={alternateMode}
                            disabled={busy || submitting}
                            onClick={() => {
                                setAlternateModes(current => ({
                                    ...current,
                                    [context]: !alternateMode
                                }));
                            }}
                            title={modeToggle.title}
                        >
                            {alternateMode ?
                                modeToggle.activeLabel ?? modeToggle.label :
                                modeToggle.label}
                        </button>
                    )}
                    <button
                        className="pcui-ai-agent-chat__send"
                        type="submit"
                        disabled={busy || submitting || draft.trim().length === 0}
                    >
                        {submitting ? copy.sending : busy ? status : copy.send}
                    </button>
                </div>
                <small className="pcui-ai-agent-chat__hint">
                    {copy.composerHint}
                </small>
            </form>
        </section>
    );
}
