// Modal pratinjau berkas eviden: gambar / PDF / video / tautan.
function ext(s = '') { const m = String(s).toLowerCase().match(/\.(pdf|jpg|jpeg|png|gif|webp|mp4|webm|mov)(\?|$)/); return m ? m[1] : ''; }

export default function FilePreview({ path, url, name, onClose }) {
  const src = path ? `/uploads/${path}` : url;
  const e = ext(name || path || url);
  const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e);
  const isPdf = e === 'pdf';
  const isVid = ['mp4', 'webm', 'mov'].includes(e);

  return (
    <div className="modal-bg" onClick={(ev) => { if (ev.target.className === 'modal-bg') onClose(); }}>
      <div className="modal preview-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="row-between mb">
          <b style={{ fontSize: 14 }}>{name || 'Pratinjau Berkas'}</b>
          <div style={{ display: 'flex', gap: 6 }}>
            <a className="btn sm secondary" href={src} target="_blank" rel="noreferrer">Buka Tab Baru ↗</a>
            <button className="btn sm secondary" onClick={onClose}>Tutup</button>
          </div>
        </div>
        <div className="preview-body">
          {isImg && <img src={src} alt={name} />}
          {isPdf && <iframe src={src} title="pdf" />}
          {isVid && <video src={src} controls />}
          {!isImg && !isPdf && !isVid && (
            <div className="center muted" style={{ padding: 30 }}>
              Dokumen ini tidak dapat dipratinjau di peramban.<br />
              <a className="btn sm" href={src} target="_blank" rel="noreferrer" download style={{ marginTop: 10, display: 'inline-block' }}>⬇ Unduh berkas</a>
              <div style={{ marginTop: 10, fontSize: 11, wordBreak: 'break-all' }}>{src}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
