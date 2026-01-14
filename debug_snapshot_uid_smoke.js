import { SnapshotManager } from './background/control/snapshot.js';

class FakeConnection {
  constructor(sequence) {
    this.sequence = sequence;
    this.index = 0;
    this.onDetachCallbacks = [];
  }

  onDetach(cb) {
    this.onDetachCallbacks.push(cb);
  }

  async sendCommand(method) {
    if (method === 'DOM.enable') return {};
    if (method === 'Accessibility.enable') return {};
    if (method === 'Accessibility.getFullAXTree') {
      const nodes = this.sequence[Math.min(this.index, this.sequence.length - 1)];
      this.index += 1;
      return { nodes };
    }
    return {};
  }
}

function getUidByBackend(snapshotMap, backendNodeId) {
  for (const [uid, backend] of snapshotMap.entries()) {
    if (backend === backendNodeId) return uid;
  }
  return null;
}

async function main() {
  const snapshot1 = [
    { nodeId: 1, role: { value: 'RootWebArea' }, name: { value: 'Page' }, childIds: [2, 3] },
    { nodeId: 2, role: { value: 'button' }, name: { value: 'A' }, backendDOMNodeId: 100 },
    { nodeId: 3, role: { value: 'button' }, name: { value: 'B' }, backendDOMNodeId: 101 }
  ];

  const snapshot2 = [
    { nodeId: 1, role: { value: 'RootWebArea' }, name: { value: 'Page' }, childIds: [3, 2, 4] },
    { nodeId: 2, role: { value: 'button' }, name: { value: 'A' }, backendDOMNodeId: 100 },
    { nodeId: 3, role: { value: 'button' }, name: { value: 'B' }, backendDOMNodeId: 101 },
    { nodeId: 4, role: { value: 'button' }, name: { value: 'C' }, backendDOMNodeId: 102 }
  ];

  const connection = new FakeConnection([snapshot1, snapshot2]);
  const manager = new SnapshotManager(connection);

  await manager.takeSnapshot({ forceRefresh: true, verbose: true });
  const uidA1 = getUidByBackend(manager.snapshotMap, 100);
  const uidB1 = getUidByBackend(manager.snapshotMap, 101);

  await manager.takeSnapshot({ forceRefresh: true, verbose: true });
  const uidA2 = getUidByBackend(manager.snapshotMap, 100);
  const uidB2 = getUidByBackend(manager.snapshotMap, 101);

  const stableA = uidA1 && uidA2 && uidA1 === uidA2;
  const stableB = uidB1 && uidB2 && uidB1 === uidB2;

  if (!stableA || !stableB) {
    console.error('Stable UID mapping failed:', { uidA1, uidA2, uidB1, uidB2 });
    process.exit(1);
  }

  console.log('Stable UID mapping ok:', { uidA: uidA1, uidB: uidB1 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

