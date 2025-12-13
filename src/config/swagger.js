import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SchoolPortal API',
      version: '1.0.0',
      description: `
# SchoolPortal API Documentation

A comprehensive school management system API that provides endpoints for managing schools, students, teachers, classes, grades, and announcements.

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your_access_token>
\`\`\`

## School Context

Most endpoints require a school context. Provide the school ID via:
- Header: \`X-School-Id: <school_uuid>\`
- Query parameter: \`?school_id=<school_uuid>\`
- Request body: \`{ "school_id": "<school_uuid>" }\`

## Error Handling

All errors follow a consistent format:
\`\`\`json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE",
    "details": [] // Optional field-level errors
  }
}
\`\`\`

## Rate Limiting

API requests are rate-limited to 100 requests per 15 minutes per IP.
      `,
      contact: {
        name: 'API Support',
        email: 'support@schoolportal.com',
      },
      license: {
        name: 'ISC',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'Authentication', description: 'User authentication endpoints' },
      { name: 'Schools', description: 'School management endpoints' },
      { name: 'Teachers', description: 'Teacher management endpoints' },
      { name: 'Students', description: 'Student management endpoints' },
      { name: 'Classes', description: 'Class management endpoints' },
      { name: 'Grades', description: 'Grade management endpoints' },
      { name: 'Announcements', description: 'Announcement endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
      schemas: {
        // Error response schema
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'An error occurred' },
                code: { type: 'string', example: 'ERROR_CODE' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },

        // School schema
        School: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Springfield Elementary' },
            school_key: { type: 'string', example: 'ABCD1234' },
            logo_url: { type: 'string', format: 'uri' },
            address: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email' },
            website: { type: 'string', format: 'uri' },
            timezone: { type: 'string', example: 'UTC' },
            academic_year_start: { type: 'string', format: 'date' },
            academic_year_end: { type: 'string', format: 'date' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        CreateSchool: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 3, maxLength: 255 },
            address: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email' },
            website: { type: 'string', format: 'uri' },
            timezone: { type: 'string', default: 'UTC' },
            academic_year_start: { type: 'string', format: 'date' },
            academic_year_end: { type: 'string', format: 'date' },
          },
        },

        // Teacher schema
        Teacher: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            school_id: { type: 'string', format: 'uuid' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            department: { type: 'string' },
            designation: { type: 'string' },
            qualification: { type: 'string' },
            hire_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'inactive', 'on_leave'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },

        CreateTeacher: {
          type: 'object',
          required: ['first_name', 'last_name', 'email'],
          properties: {
            first_name: { type: 'string', maxLength: 100 },
            last_name: { type: 'string', maxLength: 100 },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            department: { type: 'string', maxLength: 100 },
            designation: { type: 'string', maxLength: 100 },
            qualification: { type: 'string', maxLength: 255 },
            hire_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'inactive', 'on_leave'], default: 'active' },
          },
        },

        // Student schema
        Student: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            school_id: { type: 'string', format: 'uuid' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            date_of_birth: { type: 'string', format: 'date' },
            gender: { type: 'string' },
            roll_number: { type: 'string' },
            grade: { type: 'string' },
            section: { type: 'string' },
            admission_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'inactive', 'graduated', 'transferred'] },
            address: { type: 'string' },
            emergency_contact: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },

        CreateStudent: {
          type: 'object',
          required: ['first_name', 'last_name'],
          properties: {
            first_name: { type: 'string', maxLength: 100 },
            last_name: { type: 'string', maxLength: 100 },
            email: { type: 'string', format: 'email' },
            date_of_birth: { type: 'string', format: 'date' },
            gender: { type: 'string', enum: ['male', 'female', 'other'] },
            roll_number: { type: 'string' },
            grade: { type: 'string' },
            section: { type: 'string' },
            admission_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
            address: { type: 'string' },
            emergency_contact: { type: 'string' },
          },
        },

        // Auth schemas
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
          },
        },

        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                session: {
                  type: 'object',
                  properties: {
                    access_token: { type: 'string' },
                    refresh_token: { type: 'string' },
                    expires_in: { type: 'integer' },
                  },
                },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    email: { type: 'string' },
                    user_metadata: { type: 'object' },
                  },
                },
              },
            },
          },
        },

        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'admin_key'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            admin_key: { type: 'string', description: 'Required for admin registration' },
          },
        },
      },
      parameters: {
        schoolId: {
          name: 'X-School-Id',
          in: 'header',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'The ID of the school context for this request',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'No authentication token provided',
                  code: 'UNAUTHORIZED',
                },
              },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'You do not have permission to perform this action',
                  code: 'FORBIDDEN',
                },
              },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'Resource not found',
                  code: 'NOT_FOUND',
                },
              },
            },
          },
        },
        BadRequest: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'Validation failed',
                  code: 'VALIDATION_ERROR',
                  details: [
                    { field: 'email', message: 'Must be a valid email address' },
                  ],
                },
              },
            },
          },
        },
        SchoolRequired: {
          description: 'School ID is required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  message: 'School ID is required. Please select or create a school first',
                  code: 'SCHOOL_REQUIRED',
                },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'], // Path to the API route files
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
