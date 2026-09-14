function mapApplicationCandidate(candidate) {
    if (!candidate) return null;
    return {
        id: candidate.id,
        name: candidate.name || '',
        email: candidate.email || '',
        phoneNumber: candidate.phone_number || '',
        major: candidate.major || '',
        gpa: candidate.gpa || '',
        year: candidate.year || '',
        pronouns: candidate.pronouns || '',
        urm: candidate.urm || '',
        linkedin: candidate.linkedin || '',
        gm: candidate.gm || '',
        newbieTraining: candidate.newbie_training || '',
        whyConsulting: candidate.why_consulting || '',
        why180dc: candidate.why_180dc || '',
        whySocialImpact: candidate.why_social_impact || '',
        extenuatingCircumstances: candidate.extenuating_circumstances || '',
        headshot: candidate.headshot || '',
        resumeFileUrl: candidate.resume_file_url || '',
        appliedAt: candidate.created_at || null,
    };
}

module.exports = { mapApplicationCandidate };
