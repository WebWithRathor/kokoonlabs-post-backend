# Antigravity Instructions

## Project Guidelines

1. **CamelCase Standard**:
   - Always use `camelCase` for all API query parameters, body parameters, variables, interfaces, and validator targets (e.g. `courseMode`, `difficultyLevel`, `page`, `limit`).

2. **Pagination Standard**:
   - **Request**: Parsed into `req.pagination` (`{ page, limit, skip }`).
   - **Response**: Paginated endpoints must include the `pagination` object matching the interface:
     ```typescript
     export interface pagination {
       currentPage: number;
       total: number;
       limit: number;
       totalPages: number;
     }
     ```

3. **Architecture Triad**:
   - Route $\rightarrow$ Validator (`validateXxx`) $\rightarrow$ Middleware (`parseQueryParams`) $\rightarrow$ Controller (`xxxController`) $\rightarrow$ Service $\rightarrow$ DAO.
