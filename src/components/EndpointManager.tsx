import { useState } from 'react';
import type { IloEndpoint, EndpointInput } from '../types/ilo';
import {
  addEndpoint,
  updateEndpoint,
  deleteEndpoint,
  testEndpoint,
} from '../api/client';

interface EndpointManagerProps {
  endpoints: IloEndpoint[];
  onChange: () => void;
}

interface FormState {
  id: string | null;
  name: string;
  host: string;
  username: string;
  password: string;
  sotf: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  host: '',
  username: '',
  password: '',
  sotf: false,
};

/** Panel to add, edit, test and remove iLO endpoints. */
export function EndpointManager({ endpoints, onChange }: EndpointManagerProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const startEdit = (ep: IloEndpoint) =>
    setForm({
      id: ep.id,
      name: ep.name,
      host: ep.host,
      username: ep.username,
      password: '',
      sotf: !!ep.sotf,
    });

  const reset = () => {
    setForm(EMPTY_FORM);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.host.trim() || !form.username.trim()) {
      setError('Host and username are required.');
      return;
    }
    if (!form.id && !form.password) {
      setError('Password is required for a new endpoint.');
      return;
    }
    const input: EndpointInput = {
      name: form.name.trim() || undefined,
      host: form.host.trim(),
      username: form.username.trim(),
      password: form.password || undefined,
      sotf: form.sotf,
    };
    setBusy(true);
    try {
      if (form.id) await updateEndpoint(form.id, input);
      else await addEndpoint(input);
      reset();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save endpoint');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this endpoint?')) return;
    try {
      await deleteEndpoint(id);
      if (form.id === id) reset();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete endpoint');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestMsg((m) => ({ ...m, [id]: 'Testing…' }));
    try {
      const result = await testEndpoint(id);
      setTestMsg((m) => ({ ...m, [id]: result.message }));
    } catch (err) {
      setTestMsg((m) => ({
        ...m,
        [id]: err instanceof Error ? err.message : 'Test failed',
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="panel">
      <h2>iLO Endpoints</h2>

      <form className="endpoint-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <input
            placeholder="Display name (optional)"
            value={form.name}
            onChange={set('name')}
          />
          <input
            placeholder="Host or IP (e.g. 10.10.10.10)"
            value={form.host}
            onChange={set('host')}
            required
          />
        </div>
        <div className="form-row">
          <input
            placeholder="Username"
            value={form.username}
            onChange={set('username')}
            required
          />
          <input
            type="password"
            placeholder={form.id ? 'Password (leave blank to keep)' : 'Password'}
            value={form.password}
            onChange={set('password')}
          />
        </div>
        <label className="sotf-toggle">
          <input
            type="checkbox"
            checked={form.sotf}
            onChange={(e) => setForm((f) => ({ ...f, sotf: e.target.checked }))}
          />
          <span className="sotf-toggle-label">
            Enable Silence of the Fans (fan speed control)
          </span>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary full-width" disabled={busy}>
            {busy ? 'Saving…' : form.id ? 'Save Changes' : 'Add Endpoint'}
          </button>
          {form.id && (
            <button type="button" className="btn" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>

      {endpoints.length === 0 ? (
        <p className="empty-hint">No endpoints configured yet. Add one above.</p>
      ) : (
        <ul className="endpoint-list">
          {endpoints.map((ep) => (
            <li key={ep.id} className="endpoint-item">
              <div className="endpoint-info">
                <div className="endpoint-avatar">
                  {ep.name.charAt(0).toUpperCase()}
                </div>
                <span className="endpoint-name">{ep.name}</span>
                <span className="endpoint-host">{ep.host}</span>
                <span className="endpoint-user">{ep.username}</span>
                {ep.sotf && <span className="sotf-badge">SOTF</span>}
              </div>
              <div className="endpoint-actions">
                {testMsg[ep.id] && (
                  <span className={`test-msg ${testMsg[ep.id].startsWith('Connected') ? 'ok' : 'err'}`}>
                    {testMsg[ep.id]}
                  </span>
                )}
                <button
                  className="btn"
                  onClick={() => handleTest(ep.id)}
                  disabled={testingId === ep.id}
                >
                  {testingId === ep.id ? 'Testing…' : 'Test'}
                </button>
                <button className="btn" onClick={() => startEdit(ep)}>
                  Edit
                </button>
                <button className="btn danger" onClick={() => handleDelete(ep.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
