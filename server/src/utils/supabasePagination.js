const DEFAULT_PAGE_SIZE = 1000;

async function fetchAllRows(buildQuery, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function fetchAllRowsResult(buildQuery, options) {
  try {
    return { data: await fetchAllRows(buildQuery, options), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  fetchAllRows,
  fetchAllRowsResult,
};
