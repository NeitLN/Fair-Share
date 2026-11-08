# Specification Quality Checklist: Telling the amount actually sent

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-08
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- "The server MUST refuse" (FR-002, SC-005) names where the check lives because the app's rule is that the
  server decides money and access (constitution II), not how it is built.
- Reviewed in several rounds (08/11): the notice became "money told and not yet recorded", with partial
  confirmation, hand-typed repayments marked as told money or not, versions on every change, and what deleting a
  repayment gives back. No contradiction left.
- Three choices were made without asking, and are listed under Assumptions: "Báo thêm" adds to the same notice
  (one confirmation for the total), the note is seen by the whole house like the notice, and telling more than is
  owed is not allowed.
