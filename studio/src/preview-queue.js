// Share thumbnail work across frames so a grid never paints every canvas in one effect flush.
const pending = new Map();
let serial = 0;
let scheduled = false;
function schedule() {
  if (scheduled || !pending.size) return;
  scheduled = true;
  requestAnimationFrame(() => setTimeout(() => {
    scheduled = false;
    const end = performance.now() + 6;
    while (pending.size && performance.now() < end) {
      const [id,task] = pending.entries().next().value;
      pending.delete(id);
      try { task(); } catch (error) { console.error('Preview could not be drawn:',error); }
    }
    schedule();
  },0));
}
export function schedulePreview(task) {
  const id = ++serial;
  pending.set(id,task);
  schedule();
  return () => pending.delete(id);
}
