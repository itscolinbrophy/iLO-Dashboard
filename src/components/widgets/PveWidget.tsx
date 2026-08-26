import { useState } from 'react';
import { Icon } from '../common/Icon';
import { sendPvePowerAction } from '../../api/homelabClient';
import { WebTerminal, type ShellTarget } from '../WebTerminal';
import { CreateGuestModal } from '../CreateGuestModal';
import type { PveStatus, PbsStatus, ServiceDataResponse } from '../../types/homelab';

interface PveWidgetProps {
  title?: string;
  response?: ServiceDataResponse<PveStatus>;
  pbsResponse?: ServiceDataResponse<PbsStatus>;
  loading?: boolean;
  serviceId?: string;
  onRefresh?: () => void;
}

function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

type PowerAction = 'start' | 'stop' | 'shutdown' | 'reboot' | 'reset';

export function PveWidget({ title = 'Proxmox VE Cluster', response, loading, serviceId, onRefresh }: PveWidgetProps) {
  const data = response?.data;
  const isOk = response?.ok && data;
  const nodes = data?.nodes || [];
  const vms = data?.vms || [];
  const [busyVmid, setBusyVmid] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});
  const [shellTarget, setShellTarget] = useState<ShellTarget | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const handlePowerAction = async (vm: { vmid: number; name: string; status: string }, action: PowerAction) => {
    if (!serviceId) {
      setActionMsg((m) => ({ ...m, [vm.vmid]: 'No PVE service linked to this widget' }));
      return;
    }
    if (action === 'stop' || action === 'reboot' || action === 'reset') {
      const confirmMsg =
        action === 'stop'
          ? `Force-stop ${vm.name} (VM ${vm.vmid})?`
          : action === 'reset'
          ? `Hard reset ${vm.name} (VM ${vm.vmid})?`
          : `Reboot ${vm.name} (VM ${vm.vmid})?`;
      if (!window.confirm(confirmMsg)) return;
    }
    setBusyVmid(vm.vmid);
    setActionMsg((m) => ({ ...m, [vm.vmid]: `Sending ${action}…` }));
    try {
      const result = await sendPvePowerAction(serviceId, vm.vmid, action);
      if (result.ok) {
        setActionMsg((m) => ({ ...m, [vm.vmid]: `✓ ${action} sent` }));
        setTimeout(() => onRefresh && onRefresh(), 1200);
      } else {
        setActionMsg((m) => ({ ...m, [vm.vmid]: `✗ ${result.error || 'Failed'}` }));
      }
    } catch (err: any) {
      setActionMsg((m) => ({ ...m, [vm.vmid]: `✗ ${err.message || 'Failed'}` }));
    } finally {
      setBusyVmid(null);
    }
  };

  return (
    <div className="homelab-widget pve-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon pve-badge">
            <Icon name="pve" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">
              {data?.clusterName || 'Proxmox VE'} • {nodes.length} Node{nodes.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className="status-indicator online" />
          <span>{data?.runningVms ?? 0} / {data?.totalVms ?? 0} Running</span>
        </div>
      </div>

      {serviceId && (
        <div className="pve-toolbar">
          <button className="btn secondary sm" onClick={() => setShowCreate(true)}>
            + New Container / VM
          </button>
        </div>
      )}

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to fetch Proxmox VE metrics: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="pve-content">
          <div className="pve-nodes-list">
            {nodes.map((node) => {
              const memPct = Math.round((node.memUsedBytes / (node.memTotalBytes || 1)) * 100);
              return (
                <div key={node.node} className="pve-node-card">
                  <div className="node-title-row">
                    <span className="node-name font-mono">{node.node}</span>
                    <span className="badge badge-sm">{node.status}</span>
                  </div>
                  <div className="node-gauges">
                    <div className="mini-gauge">
                      <div className="gauge-header">
                        <span>CPU</span>
                        <span className="font-mono">{node.cpuUsagePercent}%</span>
                      </div>
                      <div className="progress-bar-track">
                        <div
                          className="progress-bar-fill info"
                          style={{ width: `${node.cpuUsagePercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="mini-gauge">
                      <div className="gauge-header">
                        <span>RAM</span>
                        <span className="font-mono">{memPct}% ({formatBytes(node.memUsedBytes)})</span>
                      </div>
                      <div className="progress-bar-track">
                        <div
                          className={`progress-bar-fill ${memPct > 85 ? 'warning' : 'accent'}`}
                          style={{ width: `${memPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="node-vms-summary">
                    <span>{node.vmsRunning} VMs online</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pve-vms-table-container">
            <div className="subheading-row">
              <span className="subheading">
                Virtual Machines & LXC ({vms.length})
              </span>
            </div>
            <div className="vms-table pve-vms-scrollable">
              {vms.map((vm) => (
                <div key={vm.vmid} className="vm-table-row">
                  <span className={`vm-status-dot ${vm.status === 'running' ? 'on' : 'off'}`} />
                  <div className="vm-main">
                    <div className="vm-name-row">
                      <span className="vm-name">{vm.name}</span>
                    </div>
                    <span className="vm-meta font-mono text-muted">
                      [{vm.vmid}] {vm.node} • {vm.cpu}% CPU
                    </span>
                  </div>
                  <div className="vm-actions">
                    <span className="vm-type-sep">
                      <span className={`vm-type-badge ${vm.type === 'qemu' ? 'vm-badge' : 'lxc-badge'}`}>
                        {vm.type === 'qemu' ? 'VM' : 'LXC'}
                      </span>
                      <span className="vm-type-pipe">|</span>
                    </span>
                    {actionMsg[vm.vmid] && (
                      <span className="vm-action-msg text-muted">{actionMsg[vm.vmid]}</span>
                    )}
                    <button
                      className="vm-power-btn"
                      title={`Open shell for ${vm.name}`}
                      disabled={!serviceId}
                      onClick={() =>
                        setShellTarget({
                          serviceId: serviceId!,
                          vmid: vm.vmid,
                          type: vm.type,
                          node: vm.node,
                          title: `${vm.name} (${vm.type === 'qemu' ? 'VM' : 'LXC'} ${vm.vmid})`,
                        })
                      }
                    >
                      <Icon name="terminal" size={13} />
                    </button>
                    <button
                      className="vm-power-btn success"
                      title={`Start ${vm.name}`}
                      disabled={busyVmid === vm.vmid || vm.status === 'running'}
                      onClick={() => handlePowerAction(vm, 'start')}
                    >
                      <Icon name="play" size={13} />
                    </button>
                    <button
                      className="vm-power-btn"
                      title={`Shut down ${vm.name}`}
                      disabled={busyVmid === vm.vmid || vm.status !== 'running'}
                      onClick={() => handlePowerAction(vm, 'shutdown')}
                    >
                      <Icon name="power" size={13} />
                    </button>
                    <button
                      className="vm-power-btn"
                      title={`Reboot ${vm.name}`}
                      disabled={busyVmid === vm.vmid || vm.status !== 'running'}
                      onClick={() => handlePowerAction(vm, 'reboot')}
                    >
                      <Icon name="refresh" size={13} />
                    </button>
                    <button
                      className="vm-power-btn danger"
                      title={`Force stop ${vm.name}`}
                      disabled={busyVmid === vm.vmid || vm.status !== 'running'}
                      onClick={() => handlePowerAction(vm, 'stop')}
                    >
                      <Icon name="stop" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {shellTarget && (
        <WebTerminal target={shellTarget} onClose={() => setShellTarget(null)} />
      )}
      {showCreate && serviceId && (
        <CreateGuestModal
          serviceId={serviceId}
          nodes={nodes.map((n) => ({ node: n.node, status: n.status }))}
          onClose={() => setShowCreate(false)}
          onCreated={(vmid) => {
            setShowCreate(false);
            setActionMsg((m) => ({ ...m, [vmid]: '✓ created' }));
            setTimeout(() => onRefresh && onRefresh(), 1500);
          }}
        />
      )}
    </div>
  );
}

export function PbsWidget({ title = 'Proxmox Backup Server', response, loading }: { title?: string; response?: ServiceDataResponse<PbsStatus>; loading?: boolean }) {
  const data = response?.data;
  const isOk = response?.ok && data;
  const datastores = data?.datastores || [];

  return (
    <div className="homelab-widget pbs-widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <div className="service-badge-icon pbs-badge">
            <Icon name="database" size={16} />
          </div>
          <div>
            <h3 className="widget-title">{title}</h3>
            <span className="widget-sub">Backup Verification & Pools</span>
          </div>
        </div>
        <div className="widget-status-pill">
          <span className="status-indicator online" />
          <span>{data?.status || 'Online'}</span>
        </div>
      </div>

      {!isOk && !loading ? (
        <div className="widget-error-state">
          <span>Failed to connect to PBS: {response?.error || 'Unavailable'}</span>
        </div>
      ) : (
        <div className="pbs-content">
          <div className="pbs-datastores">
            {datastores.map((ds) => (
              <div key={ds.store} className="datastore-item">
                <div className="ds-header">
                  <span className="ds-name font-mono">{ds.store}</span>
                  <span className="ds-pct font-mono">{ds.usagePercent}%</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className={`progress-bar-fill ${ds.usagePercent > 80 ? 'warning' : 'accent'}`}
                    style={{ width: `${ds.usagePercent}%` }}
                  />
                </div>
                <div className="ds-details">
                  <span className="ds-used font-mono">{formatBytes(ds.usedBytes)}</span>
                  <span className="ds-total text-muted">used of {formatBytes(ds.totalBytes)}</span>
                  <span className="ds-avail text-muted">({formatBytes(ds.availBytes)} free)</span>
                </div>
              </div>
            ))}
          </div>

          {data?.activeTasks && data.activeTasks.length > 0 && (
            <div className="pbs-tasks-list">
              <span className="subheading">Recent Tasks</span>
              {data.activeTasks.slice(0, 3).map((t, idx) => (
                <div key={idx} className="pbs-task-item">
                  <span className={`task-type badge badge-sm badge-${t.workerType}`}>{t.workerType}</span>
                  <span className="task-id font-mono text-muted">{t.id}</span>
                  <span className={`task-status ${t.status === 'OK' ? 'text-success' : 'text-warning'}`}>{t.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
