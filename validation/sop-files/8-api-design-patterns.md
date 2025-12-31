# API-DESIGN-PATTERNS.md — STRICT API DESIGN RULES

These rules apply to REST API design, response formats, pagination, and DTO patterns.

Claude must follow these strictly when designing or modifying API endpoints.

---

# 1. CONSISTENT RESPONSE FORMAT (MANDATORY)

## 1.1 Success Response Format

```typescript
// Single entity
{
  "data": { ... }
}

// List with pagination
{
  "data": [ ... ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

## 1.2 Error Response Format

```typescript
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

## 1.3 Never Return Raw Arrays

```typescript
// BAD
return [item1, item2, item3];

// GOOD
return { data: [item1, item2, item3] };
```

---

# 2. PAGINATION (MANDATORY FOR LISTS)

## 2.1 All List Endpoints Must Paginate

```typescript
// BAD - fetches everything
const assessments = await this.prisma.assessments.findMany({
  where: { user_id: userId }
}); // Could be thousands!

// GOOD - paginated
const assessments = await this.prisma.assessments.findMany({
  where: { user_id: userId },
  take: limit,
  skip: offset,
  orderBy: { created_at: 'desc' }
});
```

## 2.2 Pagination Response Pattern

```typescript
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

async findPaginated(
  filters: FilterDto,
  page = 1,
  limit = 10
): Promise<PaginatedResponse<Item>> {
  const where = this.buildWhereClause(filters);

  const [data, total] = await Promise.all([
    this.prisma.items.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' }
    }),
    this.prisma.items.count({ where })
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
}
```

## 2.3 Pagination Query DTO

```typescript
export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}
```

## 2.4 Default Limits

| Endpoint Type | Default Limit | Max Limit |
|---------------|---------------|-----------|
| Standard list | 10 | 100 |
| Search results | 20 | 50 |
| Admin/internal | 50 | 500 |
| Export (background) | N/A | No limit |

---

# 3. DTO NAMING CONVENTIONS (MANDATORY)

## 3.1 External API → snake_case

```typescript
// API Response DTO
export class AssessmentResponseDto {
  @Expose()
  id: string;

  @Expose()
  user_id: string;  // snake_case for API

  @Expose()
  organization_id: string;

  @Expose()
  created_at: Date;
}
```

## 3.2 Internal Code → camelCase

```typescript
// Internal types
interface AssessmentData {
  id: string;
  userId: string;  // camelCase internally
  organizationId: string;
  createdAt: Date;
}
```

## 3.3 DTO Transformation

```typescript
// Transform internal to external
function toResponseDto(data: AssessmentData): AssessmentResponseDto {
  return {
    id: data.id,
    user_id: data.userId,
    organization_id: data.organizationId,
    created_at: data.createdAt,
  };
}
```

---

# 4. DTO VALIDATION (MANDATORY)

## 4.1 Always Validate Input

```typescript
export class CreateRolePlayDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @IsNotEmpty()
  @IsUUID()
  organization_id: string;

  @IsNotEmpty()
  @IsUUID()
  scenario_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
```

## 4.2 Common Validators

| Field Type | Validators |
|------------|------------|
| UUID | `@IsUUID()` |
| Email | `@IsEmail()` |
| Required string | `@IsNotEmpty() @IsString()` |
| Optional string | `@IsOptional() @IsString()` |
| Enum | `@IsEnum(MyEnum)` |
| Array of UUIDs | `@IsArray() @IsUUID('4', { each: true })` |
| Date | `@IsDateString()` |
| Number | `@IsNumber() @Min(0)` |

## 4.3 Whitelist Unknown Properties

```typescript
// In main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,           // Strip unknown properties
  forbidNonWhitelisted: true, // Throw on unknown properties
  transform: true,           // Transform to DTO class
}));
```

---

# 5. NEVER EXPOSE INTERNAL FIELDS (MANDATORY)

## 5.1 Fields to Never Expose

- Internal IDs (use public UUIDs)
- Password hashes
- JWT tokens
- Internal permissions/roles structure
- Org mapping details
- Internal metadata
- Database-specific fields

## 5.2 BAD — Leaking Internals

```typescript
return {
  ...user,
  password_hash: user.password_hash,  // NEVER
  internal_role_id: user.internal_role_id,  // NEVER
  _prisma_version: user._prisma_version  // NEVER
};
```

## 5.3 GOOD — Explicit DTO

```typescript
return {
  id: user.id,
  email: user.email,
  first_name: user.first_name,
  last_name: user.last_name,
  created_at: user.created_at,
};
```

## 5.4 Use @Exclude() for Safety

```typescript
import { Exclude, Expose } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Exclude()
  password_hash: string;

  @Exclude()
  internal_role_id: string;
}
```

---

# 6. HTTP METHODS (MANDATORY)

## 6.1 Method Guidelines

| Method | Use For | Idempotent |
|--------|---------|------------|
| GET | Read resources | Yes |
| POST | Create resources | No |
| PUT | Replace entire resource | Yes |
| PATCH | Partial update | Yes |
| DELETE | Remove resource | Yes |

## 6.2 Method Rules

```typescript
// GET - never modify state
@Get(':id')
async findOne(@Param('id') id: string) {
  return this.service.findOne(id);
}

// POST - create new
@Post()
async create(@Body() dto: CreateDto) {
  return this.service.create(dto);
}

// PATCH - partial update
@Patch(':id')
async update(@Param('id') id: string, @Body() dto: UpdateDto) {
  return this.service.update(id, dto);
}

// DELETE - remove (soft or hard)
@Delete(':id')
async remove(@Param('id') id: string) {
  return this.service.remove(id);
}
```

---

# 7. URL PATTERNS (MANDATORY)

## 7.1 Resource Naming

```typescript
// GOOD - plural nouns
/api/v1/users
/api/v1/organizations
/api/v1/assessments

// BAD - verbs, singular
/api/v1/getUser
/api/v1/user
/api/v1/createAssessment
```

## 7.2 Nested Resources

```typescript
// Parent-child relationship
/api/v1/organizations/:orgId/users
/api/v1/users/:userId/assessments

// Actions (when necessary)
/api/v1/assessments/:id/start
/api/v1/assessments/:id/complete
```

## 7.3 Query Parameters

```typescript
// Filtering
/api/v1/assessments?status=completed&user_id=123

// Pagination
/api/v1/assessments?page=2&limit=20

// Sorting
/api/v1/assessments?sort=created_at&order=desc

// Search
/api/v1/users?search=john
```

---

# 8. API VERSIONING (MANDATORY)

## 8.1 Version in URL

```typescript
// GOOD
/api/v1/users
/api/v2/users

// BAD - no version
/api/users
```

## 8.2 Version Controller

```typescript
@Controller('api/v1/users')
export class UsersV1Controller {
  // V1 implementation
}

@Controller('api/v2/users')
export class UsersV2Controller {
  // V2 implementation with breaking changes
}
```

---

# 9. ERROR RESPONSES (MANDATORY)

## 9.1 Standard Error Format

```typescript
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "email",
      "message": "email must be a valid email address"
    }
  ]
}
```

## 9.2 Error Response DTO

```typescript
export class ErrorResponseDto {
  @Expose()
  statusCode: number;

  @Expose()
  message: string;

  @Expose()
  error: string;

  @Expose()
  @IsOptional()
  details?: { field: string; message: string }[];
}
```

---

# 10. MANDATORY CHECKLIST

Before designing or modifying APIs, Claude must verify:

**Response Format:**
- [ ] Consistent wrapper structure (data, meta)
- [ ] Never return raw arrays
- [ ] Error format standardized

**Pagination:**
- [ ] All list endpoints paginated
- [ ] Default and max limits set
- [ ] Total count included in meta

**DTOs:**
- [ ] snake_case for external API
- [ ] camelCase for internal code
- [ ] All inputs validated
- [ ] Unknown properties rejected

**Security:**
- [ ] No internal fields exposed
- [ ] @Exclude() on sensitive fields
- [ ] Explicit DTOs for responses

**URL Design:**
- [ ] Plural resource names
- [ ] API version in URL
- [ ] Correct HTTP methods

---

# END OF FILE
