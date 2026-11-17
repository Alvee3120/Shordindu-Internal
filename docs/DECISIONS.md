# Decisions

- Weekend: Friday only (editable setting)
- Assignment due date: optional
- Assignments visible to everyone
- Users on leave still receive assignment emails, with an 'On leave' flag
- Sessions last 30 days
- Leave: Simple marking only. No approval or cancellation flow; users mark themselves on leave, Managers/HR/Admin can mark for others.
- Mentions: Supported across all rich text (daily updates, assignments, comments). Schema uses target_type and target_id.
- Assignments: Assignees can mark their own status as Done / Complete (with optional note).
- Login: email + password (not passwordless). Registration sets the password and verifies email ownership with an OTP. Minimum password length 8.
- Password reset: self-service through an emailed OTP.
- The seeded first Admin starts without a password and sets one through the forgot-password flow.
