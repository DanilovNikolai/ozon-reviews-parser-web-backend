function updateJobStatus(jobRef, fields = {}) {
  if (!jobRef) return;

  Object.assign(jobRef, fields);

  jobRef.updatedAt = Date.now();
}

module.exports = { updateJobStatus };
