# Antigravity AI Project Coding Rules & Guidelines

## 1. Naming & Case Conventions
- **Always use `camelCase`** for all query parameters, request bodies, validator chains, route parameters, object keys, and variables across the backend.
- Do NOT use `snake_case` or `kebab-case` for query parameters (e.g. use `courseMode`, `difficultyLevel`, `page`, `limit`).

## 2. Pagination Standardization
- **Query / Request Pagination**:
  - Express query parameters for pagination must always be `page` and `limit`.
  - Express `Request` type (`custom.d.ts`) must be:
    ```typescript
    pagination?: {
      page: number;
      limit: number;
      skip: number;
    };
    ```
- **Response Pagination**:
  - Response objects must format pagination using the `pagination` interface defined in `src/interfaces/common.interface.ts`:
    ```typescript
    export interface pagination {
      currentPage: number;
      total: number;
      limit: number;
      totalPages: number;
    }
    ```
  - Response shape format:
    ```json
    {
      "courses": [...],
      "pagination": {
        "currentPage": 1,
        "total": 25,
        "limit": 20,
        "totalPages": 2
      }
    }
    ```

## 3. Validator ↔ Controller Triad
- Every route follows the strict triad pattern:
  - Route: `router.get('/', validateXxx, parseQueryParams, xxxController)`
  - Validator: `validateXxx` using `express-validator` and `validateChain` helper.
  - Controller: `xxxController` wrapped in `asyncHandler` / try-catch using `ResponseHandler.success`.
