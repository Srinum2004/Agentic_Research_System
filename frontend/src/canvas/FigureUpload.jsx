import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2 } from 'lucide-react';
import { papersApi } from '../papersApi';

export default function FigureUpload({ projectId, onUploaded, onClose }) {
    const [label, setLabel] = useState('');
    const [caption, setCaption] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const onDrop = useCallback(
        async (files) => {
            const file = files[0];
            if (!file) return;
            setBusy(true);
            setError('');
            try {
                const asset = await papersApi.uploadAsset(projectId, file, label, caption);
                onUploaded?.(asset);
                onClose?.();
            } catch (e) {
                setError(e.response?.data?.detail || 'Upload failed');
            } finally {
                setBusy(false);
            }
        },
        [projectId, label, caption, onUploaded, onClose]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        maxFiles: 1,
    });

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <h3>Upload figure</h3>
                    <button className="icon-btn" onClick={onClose}><X size={14} /></button>
                </div>
                <input
                    type="text"
                    placeholder="Label (e.g. Fig. 1)"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Caption"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                />
                <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
                    <input {...getInputProps()} />
                    {busy ? (
                        <><Loader2 className="spin" size={18} /> Uploading…</>
                    ) : (
                        <><Upload size={18} /> Drag image here or click to browse</>
                    )}
                </div>
                {error && <p className="error-message">{error}</p>}
            </div>
        </div>
    );
}
