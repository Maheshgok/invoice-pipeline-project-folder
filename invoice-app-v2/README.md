# Invoice Processing App v2

A modern React TypeScript application for invoice processing with Firebase authentication and file upload capabilities.

## Features

- 🔐 Firebase Authentication (Google OAuth + Email/Password)
- 📄 File upload with drag-and-drop support (PDF, Images)
- 👀 Invoice preview with zoom and rotation controls
- ✏️ Editable invoice data extraction
- 📱 Responsive design with Tailwind CSS
- 🔥 Modern React 18+ with TypeScript
- ⚡ Vite for fast development and building

## Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── auth/            # Authentication components
│   ├── invoice/         # Invoice-related components
│   └── upload/          # File upload components
├── contexts/            # React contexts (Auth, etc.)
├── pages/              # Main application pages
├── services/           # API and service layer
├── types/              # TypeScript type definitions
├── config/             # Configuration files
└── styles/             # CSS and styling
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Firebase project setup

### Installation

1. Clone the repository and navigate to the project:
   ```bash
   cd invoice-app-v2
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   
   Update `.env.local` with your Firebase configuration:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## Key Components

### Dashboard
- Main application interface
- File management sidebar
- Invoice viewer with zoom/rotation
- Data editor for extracted information

### FileUpload
- Drag-and-drop file upload
- Support for PDF and image formats
- File validation and error handling

### InvoiceViewer  
- Preview uploaded files
- Zoom and rotation controls
- PDF download support

### DataEditor
- Edit extracted invoice data
- Form validation
- Save changes functionality

### Authentication
- Firebase Auth integration
- Google OAuth sign-in
- Email/password authentication
- Protected routes

## Technologies Used

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Build Tool**: Vite
- **Authentication**: Firebase Auth
- **File Upload**: React Dropzone
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **Routing**: React Router

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Authentication and configure sign-in methods
3. Add your domain to authorized domains
4. Copy the Firebase config and add to environment variables

## Deployment

### Netlify (Recommended)

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy the `dist` folder to Netlify

3. Configure environment variables in Netlify dashboard

4. Set up redirects for SPA routing by adding `_redirects` file:
   ```
   /*    /index.html   200
   ```

### Other Platforms

The build output in `dist/` can be deployed to any static hosting service like Vercel, AWS S3, GitHub Pages, etc.

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production  
- `npm run preview` - Preview production build
- `npm run type-check` - Run TypeScript checks

### Code Style

- ESLint for linting
- Prettier for formatting
- TypeScript strict mode enabled
- Tailwind CSS for styling

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure build passes: `npm run build`
4. Submit a pull request

## License

MIT License - see LICENSE file for details