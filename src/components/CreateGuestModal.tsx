import { useEffect, useState } from 'react';
import {
  createPveGuest,
  fetchStorageContent,
  type CreateGuestSpec,
} from '../api/homelabClient';

interface PveNodeOption {
  node: string;
  status: string;
}

/**
 * Modal for creating a new LXC container or QEMU VM on a Proxmox VE cluster.
 * Fetches available LXC templates / ISOs from the server so the user picks
 * from real storage content rather than typing volume paths.
 */
export function CreateGuestModal({
  serviceId,
  nodes = [],
  onClose,
  onCreated,
}: {
  serviceId: string;
  nodes?: PveNodeOption[];
  onClose: () => void;
  onCreated: (vmid: number) => void;
}) {
  const [type, setType] = useState<'lxc' | 'qemu'>('lxc');
  const [hostname, setHostname] = useState('');
  const [vmid, setVmid] = useState('');
  const [node, setNode] = useState(nodes[0]?.node || '');
  const [cores, setCores] = useState(2);
  const [memoryMb, setMemoryMb] = useState(2048);
  const [diskGb, setDiskGb] = useState(8);
  const [storage, setStorage] = useState('local-lvm');
  const [template, setTemplate] = useState('');
  const [iso, setIso] = useState('');
  const [password, setPassword] = useState('');
  const [startOnCreate, setStartOnCreate] = useState(true);
  const [templates, setTemplates] = useState<Array<{ volid: string; text: string }>>([]);
  const [isos, setIsos] = useState<Array<{ volid: string; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Load templates + ISOs once
  useEffect(() => {
    fetchStorageContent(serviceId, 'vztmpl')
      .then((r) => setTemplates(r.items || []))
      .catch(() => undefined);
    fetchStorageContent(serviceId, 'iso')
      .then((r) => setIsos(r.items || []))
      .catch(() => undefined);
  }, [serviceId]);

  const submit = async () => {
    setError('');
    if (!hostname.trim()) return setError('Hostname is required');
    if (type === 'lxc' && !template) return setError('Select an LXC template');
    if (type === 'qemu' && !iso) return setError('Select an ISO image');

    const spec: CreateGuestSpec = {
      type,
      hostname: hostname.trim(),
      vmid: vmid ? Number(vmid) : undefined,
      node: node || undefined,
      cores,
      memoryMb,
      diskGb,
      storage,
      template: type === 'lxc' ? template : undefined,
      iso: type === 'qemu' ? iso : undefined,
      password: password || undefined,
      start: startOnCreate,
    };

    setBusy(true);
    try {
      const res = await createPveGuest(serviceId, spec);
      if (!res.ok) throw new Error(res.error || 'Creation failed');
      onCreated(res.vmid ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box create-guest-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New {type === 'lxc' ? 'Container' : 'Virtual Machine'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="create-guest-type-toggle">
          <button
            className={type === 'lxc' ? 'active' : ''}
            onClick={() => setType('lxc')}
          >
            LXC Container
          </button>
          <button
            className={type === 'qemu' ? 'active' : ''}
            onClick={() => setType('qemu')}
          >
            QEMU VM
          </button>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Hostname</label>
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder={type === 'lxc' ? 'my-container' : 'my-vm'}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>VMID (auto if empty)</label>
            <input
              value={vmid}
              onChange={(e) => setVmid(e.target.value.replace(/\D/g, ''))}
              placeholder="auto"
              inputMode="numeric"
            />
          </div>
          {nodes.length > 0 && (
            <div className="form-group">
              <label>Node</label>
              <select value={node} onChange={(e) => setNode(e.target.value)}>
                {nodes.map((n) => (
                  <option key={n.node} value={n.node}>
                    {n.node}{n.status !== 'online' ? ` (${n.status})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Cores</label>
            <input
              type="number" min={1} max={64}
              value={cores}
              onChange={(e) => setCores(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div className="form-group">
            <label>Memory (MB)</label>
            <input
              type="number" min={128} step={128}
              value={memoryMb}
              onChange={(e) => setMemoryMb(Math.max(128, Number(e.target.value)))}
            />
          </div>
          <div className="form-group">
            <label>Disk (GB)</label>
            <input
              type="number" min={1}
              value={diskGb}
              onChange={(e) => setDiskGb(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div className="form-group">
            <label>Storage</label>
            <input value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="local-lvm" />
          </div>

          {type === 'lxc' ? (
            <div className="form-group form-span">
              <label>OSTemplate</label>
              <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="">— select template —</option>
                {templates.map((t) => (
                  <option key={t.volid} value={t.volid}>{t.text}</option>
                ))}
              </select>
              {templates.length === 0 && (
                <span className="form-hint">No templates found — download one in PVE → local → CT Templates.</span>
              )}
            </div>
          ) : (
            <div className="form-group form-span">
              <label>ISO Image</label>
              <select value={iso} onChange={(e) => setIso(e.target.value)}>
                <option value="">— select ISO —</option>
                {isos.map((i) => (
                  <option key={i.volid} value={i.volid}>{i.text}</option>
                ))}
              </select>
              {isos.length === 0 && (
                <span className="form-hint">No ISOs found — upload one in PVE → local → ISO Images.</span>
              )}
            </div>
          )}

          <div className="form-group form-span">
            <label>{type === 'lxc' ? 'Root password (optional)' : 'Installer password (optional)'}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="leave blank to skip"
            />
          </div>

          <label className="form-check form-span">
            <input
              type="checkbox"
              checked={startOnCreate}
              onChange={(e) => setStartOnCreate(e.target.checked)}
            />
            Start after creation
          </label>
        </div>

        {error && <div className="create-guest-error">{error}</div>}

        <div className="modal-footer">
          <button className="btn secondary sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary sm" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : `Create ${type === 'lxc' ? 'Container' : 'VM'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
