import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface ShellTarget {
  serviceId: string;
  vmid?: number;
  type?: 'lxc' | 'qemu';
  node?: string;
  title: string;
}

const MIN_SIZE = 420;
const MAX_W = window.innerWidth - 48;
const MAX_H = window.innerHeight - 48;

/**
 * In-browser terminal backed by the server's /ws/shell WebSocket bridge.
 * The server SSHes to the PVE host (pct enter <vmid> for containers) and
 * streams the PTY both ways.
 */
export function WebTerminal({ target, onClose }: { target: ShellTarget; onClose: () => void }) {
  const termElRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed' | 'needauth'>('connecting');
  const [authError, setAuthError] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const resizingRef = useRef(false);

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#0d1117', red: '#ff7b72', green: '#7ee787', yellow: '#ffa657',
        blue: '#79c0ff', magenta: '#d2a8ff', cyan: '#39c5cf', white: '#b1bac4',
      },
    });
    termRef.current = term;
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    if (termElRef.current) {
      term.open(termElRef.current);
      try { fit.fit(); } catch { /* container not measured yet */ }
    }
    term.writeln(`\x1b[36mConnecting to ${target.title}…\x1b[0m`);

    // Build the WS URL — credentials come from the stored service config on
    // the server side; only routing info travels in the query string.
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      serviceId: target.serviceId,
      ...(target.vmid != null ? { vmid: String(target.vmid) } : {}),
      ...(target.type ? { type: target.type } : {}),
      ...(target.node ? { node: target.node } : {}),
    });
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/shell?${params.toString()}`);
    wsRef.current = ws;

    ws.onopen = () => setStatus('connecting');
    ws.onmessage = (ev) => {
      const data = ev.data as string;
      if (data === '\u0000ready') {
        setStatus('connected');
        term.writeln('\x1b[32mConnected.\x1b[0m\r\n');
        term.focus();
        return;
      }
      if (data === '\u0000needauth') {
        setStatus('needauth');
        term.writeln('\x1b[33mSSH credentials required — the PVE service has no stored password.\x1b[0m');
        return;
      }
      term.write(data);
    };
    ws.onclose = () => {
      setStatus((s) => (s === 'needauth' ? s : 'closed'));
      term.writeln('\r\n\x1b[33m[session closed]\x1b[0m');
    };
    ws.onerror = () => {
      setStatus('closed');
      term.writeln('\r\n\x1b[31mWebSocket error — is SSH enabled on the PVE host?\x1b[0m');
    };

    term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d);
    });

    const onResize = () => { try { fit.fit(); } catch { /* noop */ } };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      try { ws.send('\u0000close'); } catch { /* noop */ }
      ws.close();
      term.dispose();
    };
  }, [target]);

  /** Send credentials to the server after a needauth prompt. */
  const submitAuth = (username: string, password: string) => {
    setAuthError('');
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setAuthError('Connection lost — close and reopen the terminal.');
      return;
    }
    setStatus('connecting');
    termRef.current?.writeln(`\x1b[36mAuthenticating as ${username}…\x1b[0m`);
    ws.send(JSON.stringify({ username, password }));
  };

  /** Start a drag-resize operation from the bottom-right corner. */
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const w = Math.min(MAX_W, Math.max(MIN_SIZE, startW + (ev.clientX - startX)));
      const h = Math.min(MAX_H, Math.max(MIN_SIZE, startH + (ev.clientY - startY)));
      setSize({ width: w, height: h });
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      requestAnimationFrame(() => { try { fitRef.current?.fit(); } catch { /* noop */ } });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box terminal-modal"
        style={{ width: size.width, height: size.height }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>
            <span className={`terminal-status-dot ${status}`} />
            {target.title}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {status === 'needauth' && (
          <form
            className="terminal-auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              submitAuth(String(fd.get('username') || 'root'), String(fd.get('password') || ''));
            }}
          >
            <span>The PVE service has no SSH password stored. Enter host credentials:</span>
            <div className="terminal-auth-row">
              <input name="username" defaultValue="root" placeholder="username" autoComplete="username" />
              <input name="password" type="password" placeholder="password" autoComplete="current-password" autoFocus />
              <button type="submit" className="btn primary sm">Connect</button>
            </div>
            {authError && <span className="create-guest-error">{authError}</span>}
          </form>
        )}
        <div className="terminal-container" ref={termElRef} />
        <div className="terminal-hint">
          {status === 'connecting' && 'Negotiating SSH session…'}
          {status === 'connected' && (target.type === 'lxc'
            ? `Attached to container ${target.vmid} — type 'exit' to detach.`
            : 'Root shell on PVE host.')}
          {status === 'closed' && 'Session ended.'}
          {status === 'needauth' && 'Waiting for credentials…'}
        </div>
        <div className="terminal-resize-handle" onMouseDown={startResize} title="Drag to resize" />
      </div>
    </div>
  );
}
