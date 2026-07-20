"""
Every event the product actually emits. This is the complete list — if it's not
here, nothing publishes it. Kept as plain strings (not an enum) so new modules
can add events without importing a growing central enum.
"""
RESUME_VERSION_CREATED = "ResumeVersionCreated"
APPLICATION_CREATED = "ApplicationCreated"
APPLICATION_STAGE_CHANGED = "ApplicationStageChanged"
JOB_MATCHED = "JobMatched"
BOARDY_DRAFT_GENERATED = "BoardyDraftGenerated"
GITHUB_IMPORTED = "GitHubImported"
BOARDY_REPLY_RECEIVED = "BoardyReplyReceived"
RECOMMENDATION_ACCEPTED = "RecommendationAccepted"
RECOMMENDATION_REJECTED = "RecommendationRejected"
