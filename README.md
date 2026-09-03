# MedaPlus

MedaPlus is a football pitch marketplace and booking application. It supports three user roles:

- Admins approve pitch owners and pitches.
- Pitch owners manage their business profile and pitch listings.
- Players discover approved pitches and book available time slots.

The project is split into a Django REST backend and a Vite React frontend.

## Tech Stack

### Backend

- Python 3.12
- Django 6
- Django REST Framework
- Simple JWT authentication
- MongoDB through `django_mongodb_backend`
- CORS support through `django-cors-headers`

### Frontend

- React 19
- TypeScript
- Vite
- React Router
- Axios
- Leaflet and React Leaflet for maps

## Repository Structure

```text
MedaPlus/
  backend/
    accounts/            User model, auth helpers, owner approval endpoints
    bookings/            Slot and booking models, booking API
    config/              Django settings, URLs, ASGI/WSGI configuration
    media/               Uploaded pitch images in development
    mongo_migrations/    Mongo-backed Django core app migrations
    pitches/             Tenant, pitch, image, availability, approval APIs
    manage.py
  frontend/
    public/
    src/
      components/        Shared UI components and pitch wizard modal
      lib/               API clients, auth helpers, pitch API types
      pages/             Route-level React screens
    package.json
    vite.config.ts
  docs/
    TECHNICAL_ARCHITECTURE.md
  ecosystem.config.cjs   PM2 process config for deployed backend/frontend
```

## Core Features

- JWT login and token refresh.
- Player and pitch owner registration.
- Admin approval workflow for owners.
- Admin approval workflow for pitches.
- Pitch creation with images, map location, amenities, pricing, and opening hours.
- Public pitch discovery for approved and active pitches.
- Daily, weekly, and monthly slot selection views.
- Player bookings.
- Owner/admin manual cash bookings for occupied slots.
- Leaflet map-based pitch discovery and pitch location picking.

## Environment Variables

Create or update `backend/.env`:

```env
DJANGO_SECRET_KEY=change_me
DEBUG=1
ALLOWED_HOSTS=localhost,127.0.0.1

MONGODB_URI=mongodb://localhost:27017
MONGODB_NAME=pitchconnect

CORS_ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174
```

Create or update `frontend/.env`:

```env
VITE_API_URL=http://localhost:7000/api
```

For production, set `DEBUG=0`, use a strong secret key, configure real allowed hosts, and restrict CORS to the production frontend origin.

## Local Development Setup

### 1. Prerequisites

Install:

- Python 3.12
- Node.js and npm
- MongoDB

Start MongoDB locally before running the backend.

### 2. Backend Setup

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Install backend dependencies:

```powershell
pip install -r requirements.txt
```

Run migrations:

```powershell
python manage.py migrate
```

Create an admin user:

```powershell
python manage.py createsuperuser
```

Start the backend API:

```powershell
python manage.py runserver 0.0.0.0:7000
```

The backend API will be available at:

```text
http://localhost:7000/api/
```

### 3. Frontend Setup

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

The frontend will be available at:

```text
http://localhost:5174/
```

## Useful Commands

Backend:

```powershell
cd backend
python manage.py runserver 0.0.0.0:7000
python manage.py migrate
python manage.py createsuperuser
python manage.py test
```

Frontend:

```powershell
cd frontend
npm run dev
npm run build
npm run lint
npm run preview
```

## Main API Routes

Auth:

- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `GET /api/auth/me/`
- `POST /api/auth/register/`
- `POST /api/auth/logout/`

Pitches:

- `GET /api/pitches/`
- `POST /api/pitches/`
- `GET /api/pitches/<pitch_id>/`
- `PATCH /api/pitches/<pitch_id>/`

Bookings:

- `POST /api/bookings/`

Admin:

- `GET /api/admin/owners/`
- `GET /api/admin/owners/pending/`
- `POST /api/admin/owners/<user_id>/approve/`
- `GET /api/admin/pitches/pending/`
- `POST /api/admin/pitches/<pitch_id>/approve/`

## Deployment Notes

The root `ecosystem.config.cjs` contains a PM2 configuration for running:

- `meda-backend` on port `7000`
- `meda-frontend` on port `5174`

Before deploying, verify:

- Backend `.env` values are production-safe.
- `DEBUG=0`.
- `ALLOWED_HOSTS` includes the deployed backend host.
- `CORS_ALLOWED_ORIGINS` includes only trusted frontend origins.
- `VITE_API_URL` points to the deployed backend API URL.
- Uploaded media storage is handled appropriately for production.

## Documentation

Additional technical documentation lives in:

- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md)

## Known Improvement Areas

- Consider moving backend dependency management to a `pyproject.toml` if the project grows.
- Remove generated `__pycache__` files from version control.
- Remove unused `_old` files once they are no longer needed.
- Move all security-sensitive Django settings fully to environment variables.
- Add more backend and frontend tests around booking conflicts, approval flows, and role permissions.
