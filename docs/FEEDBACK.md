# User Feedback — Level 5

## Feedback Collection Method
Feedback is collected via a public Google Form linked from the README: https://docs.google.com/forms/d/e/1FAIpQLSf2KQdtBEXqYsQzVzULJf2vXowjDfCLM7aKmb8SVQnKsOaNtg/viewform?usp=header

## Raw Feedback Log
| # | User | Feedback Summary | Date |
|---|------|-----------------|------|
| 1 | [TO BE FILLED IN] | Blank space on SME/Buyer pages after switching roles (grid layout issue) | 2026-08-30 |
| 2 | [TO BE FILLED IN] | Rate field units unclear — not clear numbers are in basis points | 2026-08-30 |
| 3 | [TO BE FILLED IN] | Due Date shown as raw Unix seconds instead of a readable date | 2026-08-30 |

## What We Heard (Themes)
[TO BE FILLED IN after collecting feedback]

## What We Changed
| Change | Reason | Commit |
|--------|--------|--------|
| Removed blank space in the shared role-view grid layout | SME and Buyer pages had an empty gap left by the grid layout | `315aa3f` |
| Clarified rate field units as basis points across bid forms | Users were unsure whether rate numbers were percentages or points | `2fe1369` |
| Fixed Due Date fields to use a proper date format (was raw Unix seconds) | Users could not read the raw seconds value as a date | `93b10ff` |