import { createContext, useContext, useState, useCallback, useRef } from 'react';

const UICtx = createContext(null);

const TOAST_ICON = { success: '✅', error: '⚠️', info: 'ℹ️', loading: '⏳' };
const CONFIRM_ICON = { default: '❓', danger: '🗑️', warning: '⚠️', success: '✅' };

let _id = 0;

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null); // { title, message, confirmText, cancelText, variant, pernyataan }
  const [closing, setClosing] = useState(false);
  const [setuju, setSetuju] = useState(false); // centang pernyataan wajib
  const resolver = useRef(null);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 320);
  }, []);

  const toast = useCallback((message, type = 'info', duration = 3800) => {
    const id = ++_id;
    setToasts((t) => [...t, { id, message, type }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setClosing(false);
      setSetuju(false);
      setDialog({
        title: opts.title || 'Konfirmasi',
        message: opts.message || 'Apakah Anda yakin?',
        confirmText: opts.confirmText || 'Ya, Lanjutkan',
        cancelText: opts.cancelText || 'Batal',
        variant: opts.variant || 'default',
        // pernyataan wajib dicentang sebelum tombol konfirmasi aktif
        pernyataan: opts.pernyataan || null,
      });
    });
  }, []);

  const closeDialog = useCallback((result) => {
    setClosing(true);
    setTimeout(() => {
      setDialog(null);
      setClosing(false);
      if (resolver.current) { resolver.current(result); resolver.current = null; }
    }, 200);
  }, []);

  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast stack */}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type} ${t.leaving ? 'leaving' : ''}`} onClick={() => dismiss(t.id)}>
            <span className="toast-ic">{TOAST_ICON[t.type] || 'ℹ️'}</span>
            <span className="toast-msg">{t.message}</span>
            <span className="toast-bar" />
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {dialog && (
        <div className={`confirm-bg ${closing ? 'closing' : ''}`} onClick={() => closeDialog(false)}>
          <div className={`confirm-box ${closing ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className={`confirm-icon v-${dialog.variant}`}>{CONFIRM_ICON[dialog.variant] || '❓'}</div>
            <h3>{dialog.title}</h3>
            <p>{dialog.message}</p>
            {dialog.pernyataan && (
              <label className="confirm-pernyataan">
                <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} autoFocus />
                <span>{dialog.pernyataan}</span>
              </label>
            )}
            <div className="confirm-actions">
              <button className="btn secondary" onClick={() => closeDialog(false)}>{dialog.cancelText}</button>
              <button
                className={`btn ${dialog.variant === 'danger' ? 'red' : dialog.variant === 'warning' ? 'amber' : ''}`}
                onClick={() => closeDialog(true)}
                disabled={!!dialog.pernyataan && !setuju}
                title={dialog.pernyataan && !setuju ? 'Centang pernyataan terlebih dahulu' : ''}
                autoFocus={!dialog.pernyataan}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </UICtx.Provider>
  );
}

export const useUI = () => useContext(UICtx);
