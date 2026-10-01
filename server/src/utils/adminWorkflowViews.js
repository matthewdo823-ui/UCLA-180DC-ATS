function mapInterestReviewEntry(row, { matched = null, suggestion = null } = {}) {
  return {
    id: row.id,
    eventId: row.event_id,
    eventName: row.interest_events?.name || "Event",
    status: row.status,
    submittedAt: row.submitted_at,
    submittedName: row.submitted_name,
    submittedEmail: row.submitted_email,
    submittedUniversityId: row.submitted_university_id,
    matchedCandidate: matched ? { id: matched.id, name: matched.name, email: matched.email } : null,
    suggestedCandidate: suggestion ? { id: suggestion.id, name: suggestion.name, email: suggestion.email } : null,
  };
}

module.exports = { mapInterestReviewEntry };
