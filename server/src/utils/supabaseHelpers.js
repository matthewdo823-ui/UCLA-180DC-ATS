function firstRel(rel) {
  if (rel == null) return null;
  return Array.isArray(rel) ? rel[0] : rel;
}

module.exports = {
  firstRel,
};
