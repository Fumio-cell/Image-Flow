import { create } from 'zustand';

export interface Notice {
    title: string;
    message: string;
    /** Where focus goes when the notice is closed (default: where it was). */
    returnFocus?: () => HTMLElement | null;
}

interface NoticeState {
    notices: Notice[];
    dismiss: () => void;
}

export const useNoticeStore = create<NoticeState>((set) => ({
    notices: [],
    dismiss: () => set((s) => ({ notices: s.notices.slice(1) })),
}));

/** Show a message in the page (replaces alert): queued, one at a time, rendered by <NoticeHost />. */
export function notify(message: string, opts: { title?: string; returnFocus?: () => HTMLElement | null } = {}): void {
    useNoticeStore.setState((s) => ({ notices: [...s.notices, { title: opts.title ?? 'Image Flow', message, returnFocus: opts.returnFocus }] }));
}
