// Which status can move to which next status, and who is allowed to do it
export const allowedTransitions = {
  requested: { accepted: 'technician', rejected: 'technician', cancelled: 'customer' },
  accepted: { 'in-progress': 'technician' },
  'in-progress': { completed: 'technician' },
  // completed, rejected, cancelled = final, nothing moves out of these
};

// A booking in any of these statuses is still active
export const ACTIVE_STATUSES = ['requested', 'accepted', 'in-progress'];

// Check: is this transition allowed for this role?
export function canChange(from, to, byRole) {
  return allowedTransitions[from]?.[to] === byRole;
}
