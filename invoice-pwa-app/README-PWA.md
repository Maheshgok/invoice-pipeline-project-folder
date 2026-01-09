# Invoice Processing PWA 📱

A **Progressive Web App** version of the invoice processing system with mobile-first design, offline capabilities, and enhanced session management.

## 🚀 Quick Start

### Development
```bash
cd invoice-pwa-app
npm install
npm run dev
```

**Access URLs:**
- Local: `http://localhost:3000`
- Network: `http://[your-ip]:3000` (for mobile testing)

### PWA Installation
1. Open in mobile browser
2. Tap "Add to Home Screen" 
3. Works like a native app!

## ✨ PWA Features

- 📱 **Mobile-First Design**: Touch-optimized interface
- 🔄 **Offline Support**: Works without internet connection
- 📲 **Installable**: Add to home screen functionality
- 🔔 **Push Notifications**: Background updates and alerts
- ⚡ **Fast Loading**: Service worker caching and optimization
- 📶 **Network Awareness**: Smart handling of connection states

## 🏗 Architecture

### Enhanced Services
- **PWAService**: Offline functionality and app installation
- **SessionSecurityService**: Robust session management with forced logout recovery
- **UploadFreezeService**: Smart upload controls during critical operations

### Mobile Components  
- **MobileNavigation**: Bottom tab navigation pattern
- **Dashboard**: Mobile-optimized overview with quick actions
- **FileUpload**: Touch-friendly file handling with drag-and-drop
- **OfflineIndicator**: Real-time network status feedback

## 📊 Key Features

### Session Management
- ✅ Forced logout recovery (5-step process)
- ✅ Cost-efficient session logging (90% reduction) 
- ✅ Smart timeouts (20min activity / 24hr absolute)
- ✅ Upload freeze during session transitions

### Offline Capabilities
- 📱 View cached results and processing history
- 💾 Queue file uploads for automatic sync
- ⚙️ Access app settings and configuration
- 🔄 Background sync with exponential backoff

### Mobile Experience
- 👆 Touch-friendly 44px minimum targets
- 📱 Native bottom navigation pattern
- 🎨 Smooth animations and micro-interactions
- 📶 Connection quality indicators

## 🚀 Development & Testing

### Scripts
```bash
npm run dev          # Development with hot reload
npm run build        # Production build
npm run preview      # Preview production build
npm run serve:https  # HTTPS for PWA features
```

### PWA Testing
1. **Service Worker**: Chrome DevTools → Application
2. **Offline Mode**: Network tab → Offline checkbox
3. **Mobile View**: Device emulation in DevTools
4. **Install**: Browser menu → Install app

## 🔧 Configuration

Environment setup (copy from main project):
```bash
cp ../invoice-app-v2/.env.example .env
```

PWA-specific additions:
```bash
VITE_VAPID_PUBLIC_KEY=your_push_notification_key
```

## 📱 Mobile Access

### Network Testing
The dev server automatically exposes to local network:
- **Desktop**: `http://localhost:3000`
- **Mobile**: `http://[your-computer-ip]:3000`

### HTTPS (Required for PWA)
```bash
npm run serve:https
# Access via: https://localhost:3000
```

## 🎯 PWA vs Desktop Comparison

### ✅ PWA Advantages
- **Offline First**: Core features work without internet
- **Mobile Optimized**: Touch-friendly interface design
- **Installable**: Native app experience on mobile
- **Faster**: Service worker caching reduces load times
- **Background Sync**: Automatic retry of failed operations

### 🔄 Shared Features  
- **Backend APIs**: Same Cloud Run services
- **Session Management**: Compatible authentication
- **User Data**: Shared Firestore collections
- **File Processing**: Identical AI processing pipeline

## 📈 Performance Optimizations

- **Code Splitting**: Lazy load components and routes
- **Service Worker**: Network-first caching strategy  
- **Bundle Size**: <100KB initial load
- **Image Optimization**: WebP with fallbacks
- **Critical CSS**: Inlined for faster paint

## 🚀 Deployment

Ready for static hosting:
- **Netlify**: Automatic deployment on git push
- **Vercel**: Zero-config PWA support
- **Firebase Hosting**: Google Cloud integration
- **Any CDN**: Standard static file hosting

---

**Tech Stack**: React 18 + TypeScript + Vite + Tailwind CSS + Workbox  
**Browser Support**: iOS Safari 11.1+, Android Chrome 70+, All modern browsers  
**Backend**: Shared with desktop app (Google Cloud Run + Firebase)