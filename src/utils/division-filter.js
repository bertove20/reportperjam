/**
 * Division Filter — auto-scope queries by user's division
 *
 * superadmin: sees all divisions
 * leader/staff: sees only their division_id
 */

export function getDivisionScope(user) {
  if (user.role === 'superadmin') return { sql: '', params: [] };
  if (!user.division_id) return { sql: '', params: [] };
  return {
    divisionId: user.division_id,
    sql: 'AND division_id = ',
    params: [user.division_id],
  };
}

/**
 * Add division filter to a WHERE clause
 * Returns { where, params } with $N placeholder
 */
export function addDivisionFilter(user, existingParams = []) {
  if (user.role === 'superadmin') return { where: '', params: existingParams };
  if (!user.division_id) return { where: '', params: existingParams };

  const idx = existingParams.length + 1;
  return {
    where: ` AND division_id = $${idx}`,
    params: [...existingParams, user.division_id],
  };
}
