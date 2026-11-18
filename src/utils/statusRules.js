// { এখনকার status: { পেরর status: ক বদলােত পারেব } }
export const allowedTransitions = {
requested: { accepted: 'technician', rejected: 'technician', cancelled: 'customer' },
accepted: { 'in-progress': 'technician' },
'in-progress': { completed: 'technician' },
// completed, rejected, cancelled = final, এখান থেক কাথাও যাওয়া যােব না
};
export const ACTIVE_STATUSES = ['requested', 'accepted', 'in-progress'];
// এই পিরবতন িক বধ?
export function canChange(from, to, byRole) {
return allowedTransitions[from]?.[to] === byRole;
}