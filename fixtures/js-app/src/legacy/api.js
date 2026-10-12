// CommonJS module
function fetchUser(id) {
  return { id };
}

// ORPHAN: exported via module.exports but nobody requires it
function fetchUserLegacy(id) {
  return { id, legacy: true };
}

module.exports = { fetchUser, fetchUserLegacy };
