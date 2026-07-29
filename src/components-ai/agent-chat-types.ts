export type AgentMessageEntry = Readonly<{
    id: string;
    type: 'message';
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
}>;

export type AgentNoticeEntry = Readonly<{
    id: string;
    type: 'notice';
    text: string;
    createdAt: string;
}>;

export type AgentEntry = AgentMessageEntry | AgentNoticeEntry;

export type AgentRun = Readonly<{
    id: string;
    status: 'queued' | 'running' | 'complete' | 'error';
    queuePosition: number | null;
}>;

export type AgentState<Context extends string = string> = Readonly<{
    context: Context;
    entries: readonly AgentEntry[];
    run: AgentRun | null;
    sequence: number;
}>;

type AgentEventBase<Context extends string> = Readonly<{
    seq: number;
    context: Context;
}>;

export type AgentEvent<Context extends string = string> =
    | (AgentEventBase<Context> & Readonly<{ type: 'entry'; entry: AgentEntry }>)
    | (AgentEventBase<Context> & Readonly<{ type: 'run'; run: AgentRun }>)
    | (AgentEventBase<Context> & Readonly<{ type: 'activity'; label: string }>)
    | (AgentEventBase<Context> & Readonly<{ type: 'error'; message: string }>);

export type AgentMessageResponse = Readonly<{
    runId: string;
    entry: AgentEntry;
}>;

/**
 * Application-owned agent I/O. The component has no endpoint or EventSource
 * assumptions; adapters may use HTTP/SSE, websockets, workers, or test doubles.
 */
export type AgentTransport<
    Context extends string = string,
    Mode extends string = string
> = Readonly<{
    load: (context: Context, signal: AbortSignal) => Promise<AgentState<Context>>;
    send: (
        context: Context,
        message: string,
        mode: Mode
    ) => Promise<AgentMessageResponse>;
    subscribe: (
        context: Context,
        after: number,
        onEvent: (event: AgentEvent<Context>) => void,
        onConnectionChange: (connected: boolean) => void
    ) => () => void;
}>;

export type AgentModeToggle<Mode extends string = string> = Readonly<{
    /** The mode passed to AgentTransport.send while the toggle is active. */
    mode: Mode;
    label: string;
    activeLabel?: string;
    title?: string;
}>;

export type AgentChatCopy = Readonly<{
    panelLabel: (contextLabel: string) => string;
    conversationLabel: (contextLabel: string) => string;
    composerLabel: (contextLabel: string) => string;
    contextEyebrow: string;
    loadingConversation: string;
    emptyTitle: string;
    emptyBody: string;
    ready: string;
    sending: string;
    queued: string;
    queuePosition: (position: number) => string;
    working: string;
    needsAttention: string;
    live: string;
    connecting: string;
    sync: string;
    userName: string;
    assistantName: string;
    composerPlaceholder: string;
    send: string;
    composerHint: string;
    stateUnavailable: string;
    messageNotQueued: string;
}>;

export type AgentChatPanelProps<
    Context extends string = string,
    Mode extends string = string
> = Readonly<{
    context: Context;
    contextLabel: string;
    transport: AgentTransport<Context, Mode>;
    defaultMode: Mode;
    modeToggle?: AgentModeToggle<Mode>;
    copy?: Partial<AgentChatCopy>;
    className?: string;
}>;
