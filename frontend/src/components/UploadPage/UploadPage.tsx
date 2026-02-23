import { useState, useCallback } from 'react';
import { parseSave } from '../../api/client';
import type { ParseResponse } from '../../types';
import styles from './UploadPage.module.css';

interface Props {
  onLoaded: (data: ParseResponse) => void;
}

export default function UploadPage({ onLoaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await parseSave(file);
      onLoaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>ELDEN RING</h1>
      <p className={styles.subtitle}>Build Advisor</p>

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Reading your legacy...</span>
        </div>
      ) : (
        <>
          <div
            className={`${styles.dropzone} ${dragging ? styles.dropzoneDragging : ''}`}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
          >
            <input
              type="file"
              accept=".sl2"
              className={styles.fileInput}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <span className={styles.dropzoneIcon}>⚔</span>
            <p className={styles.dropzoneText}>
              {file ? file.name : 'Drag your save file here'}
            </p>
            <p className={styles.dropzoneHint}>
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                : 'or click to select · .sl2 file'}
            </p>
          </div>

          <button
            className={styles.button}
            disabled={!file}
            onClick={handleSubmit}
          >
            Load save
          </button>

          {error && <p className={styles.error}>{error}</p>}
        </>
      )}

      <div className={styles.divider} />
      <p className={styles.footer}>
        Your file never leaves your machine · processed locally
      </p>
    </div>
  );
}
