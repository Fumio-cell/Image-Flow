import React from 'react';

/** The one statement of a screen (display type) and its note. */
export const TrustStatement: React.FC = () => (
    <div>
        <p className="t-statement" style={{ color: 'var(--paper)', margin: 0 }}>NOTHING LEAVES THIS MACHINE</p>
        <p className="t-note" style={{ margin: 'var(--space-3) 0 0' }}>No upload. No account. The file is made here.</p>
    </div>
);
