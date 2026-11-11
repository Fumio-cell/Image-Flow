import React from 'react';
import { ModalDialog } from './ModalDialog';
import { useNoticeStore } from '../../utils/notify';

/** Shows the first queued notice as an in-page alert dialog (one "OK" button; Escape also closes it). */
export const NoticeHost: React.FC = () => {
    const notice = useNoticeStore((s) => s.notices[0]);
    const dismiss = useNoticeStore((s) => s.dismiss);
    if (!notice) return null;
    return (
        <ModalDialog
            key={notice.message + useNoticeStore.getState().notices.length}
            role="alertdialog"
            title={notice.title}
            message={notice.message}
            actions={[{ label: 'OK', primary: true, onClick: dismiss }]}
            onClose={dismiss}
            returnFocus={notice.returnFocus}
        />
    );
};
