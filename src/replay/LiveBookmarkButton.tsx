import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import SettingsDialog from '../components/ui/SettingsDialog';
import { createReplayApi } from './replayApi';

export default function LiveBookmarkButton({ domainId }: { domainId: string }) {
    const api = useMemo(() => createReplayApi(domainId), [domainId]);
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const request = useRef<AbortController | undefined>(undefined);
    useEffect(() => () => request.current?.abort(), [domainId]);
    async function save(event: FormEvent) {
        event.preventDefault();
        setPending(true); setStatus(''); setError('');
        const controller = new AbortController();
        request.current = controller;
        try {
            const result = await api.saveBookmark(undefined, note, controller.signal);
            if (controller.signal.aborted) return;
            setStatus('Bookmark saved for ' + new Date(result.bookmark.at).toLocaleString() +
                (result.ready ? '.' : '. Replay is preparing its starting state.'));
            setNote('');
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Bookmark could not be saved.');
        } finally { if (!controller.signal.aborted) setPending(false); }
    }
    return <>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>Bookmark latest telemetry</Button>
        <SettingsDialog title="Replay bookmark" show={open} onHide={() => setOpen(false)}>
            {status && <p role="status">{status}</p>}
            {error && <Alert variant="danger">{error}</Alert>}
            <form onSubmit={event => void save(event)}>
                <Form.Group><Form.Label htmlFor="live-replay-note">Bookmark note</Form.Label>
                    <Form.Control id="live-replay-note" value={note} onChange={event => setNote(event.target.value)} required maxLength={1024} />
                </Form.Group>
                <Button type="submit" disabled={pending || !note.trim()}>Save bookmark</Button>
            </form>
        </SettingsDialog>
    </>;
}
