# Table Column-Aware Selector Pattern (30 Dec 2024)

## Problem
Table cells with identical classes (e.g., `span.fluid-table__cell-content` on yr.no) caused exclusion selectors to be too generic. Excluding one column removed ALL cell content during refresh.

## Root Cause
`generateSelector()` didn't consider table column position. When cells have identical classes, it couldn't differentiate them.

## Solution
Detect if element is inside `td/th`, then prepend column position:
- `td:nth-child(5) > span.fluid-table__cell-content`

## Implementation
Added to `generateSelector()` in content.ts (lines 60-79):
1. Check if element is inside table cell: `element.closest('td, th')`
2. Get column index: `cellElement.cellIndex` (0-based)
3. Check if direct child for combinator choice (`>` vs ` `)
4. Prepend column selector: `td:nth-child(${columnIndex + 1}) > ${baseSelector}`

## Impact
~5-10% of sites with table-based layouts. Universal fix for any site using tables with uniform cell classes.

## Verification
yr.no excluded selectors now show:
- `th:nth-child(5) > span.fluid-table__cell-content` (header)
- `td:nth-child(5) > span.fluid-table__cell-content` (data cells)

Instead of generic `span.fluid-table__cell-content` that matched everything.

## Files
- src/content.ts (generateSelector function)
