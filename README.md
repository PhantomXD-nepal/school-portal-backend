# SchoolPortal Backend API

A comprehensive backend API for the SchoolPortal school management platform built with Express.js and Supabase.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control (RBAC)
- **User Management**: Support for multiple user roles (Admin, Teacher, Student, Parent, Finance Officer)
- **Student Management**: CRUD operations with bulk import support
- **Teacher Management**: Complete teacher profile and assignment management
- **Class Management**: Class creation, enrollment, and student assignment
- **Grade Management**: Grade posting, viewing, and bulk upload capabilities
- **Announcements**: Create and manage school-wide or class-specific announcements
- **Security**: Rate limiting, CORS, Helmet.js, input validation
- **Database**: Supabase (PostgreSQL) with Row Level Security (RLS)

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account and project

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   cd schoolportalbackend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```

   Update the `.env` file with your Supabase credentials:
   ```env
   PORT=5000
   NODE_ENV=development

   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
   ```

4. **Set up Supabase database**

   You'll need to create the following tables in your Supabase project:
   - `users`
   - `roles`
   - `user_roles`
   - `students`
   - `teachers`
   - `parents`
   - `classes`
   - `class_enrollments`
   - `grades`
   - `announcements`
   - `announcement_recipients`

   Refer to the PRD.md for detailed schema information.

## 🏃 Running the Application

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

The server will start on `http://localhost:5000`

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh-token` - Refresh access token
- `GET /api/auth/profile` - Get current user profile

### Students
- `GET /api/students` - List all students (with filters)
- `GET /api/students/:id` - Get student by ID
- `POST /api/students` - Create new student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Deactivate student
- `POST /api/students/bulk-import` - Bulk import students

### Teachers
- `GET /api/teachers` - List all teachers
- `GET /api/teachers/:id` - Get teacher by ID
- `POST /api/teachers` - Create new teacher
- `PUT /api/teachers/:id` - Update teacher
- `DELETE /api/teachers/:id` - Delete teacher

### Classes
- `GET /api/classes` - List all classes
- `GET /api/classes/:id` - Get class details with enrolled students
- `POST /api/classes` - Create new class
- `PUT /api/classes/:id` - Update class
- `POST /api/classes/:id/enroll` - Enroll student in class
- `DELETE /api/classes/:id/students/:studentId` - Remove student from class

### Grades
- `GET /api/grades` - List grades (with filters)
- `GET /api/grades/student/:studentId` - Get student grades
- `POST /api/grades` - Post new grade
- `PUT /api/grades/:id` - Update grade
- `DELETE /api/grades/:id` - Delete grade
- `POST /api/grades/bulk-upload` - Bulk upload grades

### Announcements
- `GET /api/announcements` - List announcements
- `GET /api/announcements/:id` - Get announcement by ID
- `POST /api/announcements` - Create announcement
- `PUT /api/announcements/:id` - Update announcement
- `DELETE /api/announcements/:id` - Delete announcement
- `POST /api/announcements/:id/read` - Mark announcement as read

### Health Check
- `GET /api/health` - API health check

## 🔐 Authentication

All protected routes require a Bearer token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## 👥 User Roles

- **Admin**: Full system access
- **Teacher**: Manage classes, students, grades, and announcements
- **Student**: View own grades and announcements
- **Parent**: View child's information
- **Finance Officer**: Manage billing (to be implemented)

## 🏗️ Project Structure

```
schoolportalbackend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── index.js      # App configuration
│   │   └── supabase.js   # Supabase client setup
│   ├── controllers/      # Route controllers
│   │   ├── authController.js
│   │   ├── studentController.js
│   │   ├── teacherController.js
│   │   ├── classController.js
│   │   ├── gradeController.js
│   │   └── announcementController.js
│   ├── middleware/       # Custom middleware
│   │   ├── auth.js       # Authentication & authorization
│   │   ├── errorHandler.js
│   │   └── validator.js
│   ├── routes/          # API routes
│   │   ├── index.js
│   │   ├── authRoutes.js
│   │   ├── studentRoutes.js
│   │   ├── teacherRoutes.js
│   │   ├── classRoutes.js
│   │   ├── gradeRoutes.js
│   │   └── announcementRoutes.js
│   └── server.js        # Express app setup
├── .env.example         # Environment variables template
├── .gitignore
├── package.json
└── README.md
```

## 🔒 Security Features

- **Helmet.js**: Secure HTTP headers
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: Prevent abuse and DDoS attacks
- **Input Validation**: Express-validator for request validation
- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Granular permissions system

## 🚧 Future Enhancements

- Billing and payment management
- Attendance tracking
- Parent management
- Advanced reporting and analytics
- File upload support
- Email notifications
- Two-factor authentication
- API documentation with Swagger

## � Frontend Integration Guide

### 1. API Configuration
Set your API base URL in your frontend environment variables:
```javascript
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
```

### 2. Authentication Flow
1.  **Login**: Send `POST /auth/login` with email/password.
2.  **Store Token**: Save `data.session.access_token` in `localStorage` or `cookies`.
3.  **Attach Header**: Add to all authenticated requests:
    ```javascript
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    ```
4.  **Handle 401**: If API returns 401, clear token and redirect to `/login`.

### 3. Registration Flows
*   **Admin Registration**: Public page. Requires `admin_key`.
*   **Teacher/Parent Registration**: **Admin Dashboard Only**. Create a form that calls `POST /admin/users`.
*   **Student Registration**: **Parent Dashboard Only**. Create a form that calls `POST /parents/register-child`.

### 4. Role-Based Access (RBAC)
The login response includes the user's role:
```javascript
const userRole = response.data.user.user_metadata.role; // 'admin', 'teacher', 'student', 'parent'
```
Use this to conditionally render navigation items:
*   **Admin**: Show "Manage Users", "Manage Schools".
    *   *Note*: If the Admin is a **Super Admin** (no linked school), show a School Dropdown when creating users. If **School Admin**, automatically assign their school.
*   **Teacher**: Show "My Classes", "Gradebook".
*   **Parent**: Show "My Children", "Register Child".
*   **Student**: Show "My Grades", "Announcements".

### 5. Error Handling
The API returns standardized errors. Create a utility to parse them:
```javascript
const getErrorMessage = (errorResponse) => {
  // Validation errors
  if (errorResponse.details) {
    return errorResponse.details.map(d => d.message).join(', ');
  }
  // Standard error
  return errorResponse.error || 'An unexpected error occurred';
};
```

## �📝 License

ISC

## 👨‍💻 Author

SchoolPortal Development Team

---

**Note**: This is a boilerplate backend. You'll need to set up the Supabase database schema according to the PRD specifications before the API will work properly.
