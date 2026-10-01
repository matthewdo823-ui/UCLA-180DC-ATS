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
        referralSource: candidate.referral_source || '',
        previouslyApplied: candidate.previously_applied || '',
        professionalDevelopment: candidate.professional_development || '',
        consultingConnectInterest: candidate.consulting_connect_interest || '',
        applicationResponses: Array.isArray(candidate.application_responses) ? candidate.application_responses : [],
        extenuatingCircumstances: candidate.extenuating_circumstances || '',
        headshot: candidate.headshot || '',
        resumeFileUrl: candidate.resume_file_url || '',
        appliedAt: candidate.created_at || null,
    };
}

module.exports = { mapApplicationCandidate };
