# PWA Testing Guide

## Overview
This guide provides comprehensive testing instructions for the Invoice Processing PWA, covering functionality, performance, and deployment verification.

## Prerequisites
- Node.js 18+ installed
- Firebase project configured
- All environment variables set

## Local Development Testing

### 1. Start Development Server
```bash
cd invoice-pwa-app
npm run dev
```
- Should start on `http://localhost:5173` (or next available port)
- Check for any console errors during startup

### 2. Build and Preview
```bash
npm run build
npm run preview
```
- Build should complete without errors
- Preview should serve the production build locally

## PWA Functionality Testing

### 1. Service Worker Registration
1. Open DevTools → Application → Service Workers
2. Verify service worker is registered and activated
3. Check for any service worker errors in console

### 2. Installation Testing
1. **Desktop (Chrome/Edge)**:
   - Look for install icon in address bar
   - Click install and verify app installs
   - Test opening installed app

2. **Mobile**:
   - Open in mobile browser
   - Look for "Add to Home Screen" prompt
   - Install and test launch from home screen

### 3. Offline Functionality
1. With app open, go to DevTools → Network
2. Check "Offline" checkbox
3. Refresh the page
4. Verify app loads and shows offline message
5. Test navigation between cached pages

### 4. Manifest Testing
1. Open DevTools → Application → Manifest
2. Verify all manifest properties are correct:
   - Name: "Invoice Processing PWA"
   - Theme color: #3b82f6
   - Icons display properly

## Authentication Testing

### 1. Login Flow
```bash
# Test credentials (if using demo)
Email: test@company.com
Password: testpassword123
```

1. Navigate to login page
2. Test email/password login
3. Test Google OAuth login (if enabled)
4. Verify redirect to dashboard after login
5. Check session persistence on page refresh

### 2. Session Management
1. Log in and close browser tab
2. Reopen app - should remain logged in
3. Test logout functionality
4. Verify complete session cleanup on logout

## Upload Functionality Testing

### 1. File Upload
1. Navigate to upload section
2. Test drag and drop with invoice files
3. Test file picker selection
4. Test file validation (size, type restrictions)
5. Verify upload progress indicators

### 2. Multi-Upload Testing
1. Select multiple files (2-5 invoices)
2. Monitor batch processing
3. Verify individual file progress
4. Test cancellation of uploads
5. Check error handling for failed uploads

## Mobile Responsiveness Testing

### 1. Device Testing
Test on multiple screen sizes:
- Mobile phones (320px - 480px)
- Tablets (768px - 1024px)
- Desktop (1024px+)

### 2. Touch Interactions
1. Test all buttons and links
2. Verify proper touch targets (44px minimum)
3. Test swipe gestures if implemented
4. Check pinch-to-zoom behavior

### 3. Orientation Testing
1. Test portrait mode
2. Test landscape mode
3. Verify layout adapts properly
4. Check for content overflow issues

## Performance Testing

### 1. Lighthouse Audit
```bash
# Run Lighthouse in Chrome DevTools
# Or use CLI
npm install -g lighthouse
lighthouse http://localhost:5173 --output=json --output=html --output-path=./lighthouse-report
```

Target scores:
- Performance: >90
- Accessibility: >90
- Best Practices: >90
- PWA: 100

### 2. Loading Performance
1. Test initial page load time
2. Check Time to Interactive (TTI)
3. Verify lazy loading of images
4. Test caching effectiveness

### 3. Bundle Analysis
```bash
npm run build
# Check dist/ folder sizes
# Main bundle should be <250KB
# CSS should be <50KB
```

## Security Testing

### 1. Authentication Security
1. Test with expired tokens
2. Verify proper token refresh
3. Test session timeout behavior
4. Check for XSS vulnerabilities in forms

### 2. Data Security
1. Verify HTTPS is enforced
2. Check Firebase security rules
3. Test file upload security
4. Verify no sensitive data in localStorage

## Integration Testing

### 1. Firebase Integration
1. Test Firestore read/write operations
2. Verify real-time updates
3. Test file storage uploads
4. Check authentication state sync

### 2. API Integration
1. Test all Cloud Run service calls
2. Verify error handling for API failures
3. Test request timeouts and retries
4. Check proper loading states

## Error Handling Testing

### 1. Network Errors
1. Disconnect internet during operations
2. Test with poor network conditions
3. Verify graceful degradation
4. Check error message clarity

### 2. Server Errors
1. Test with invalid API responses
2. Simulate server downtime
3. Test rate limiting scenarios
4. Verify fallback mechanisms

## Accessibility Testing

### 1. Keyboard Navigation
1. Tab through entire application
2. Verify focus indicators are visible
3. Test Enter/Space key interactions
4. Check tab order is logical

### 2. Screen Reader Testing
1. Test with NVDA/JAWS (Windows)
2. Test with VoiceOver (Mac)
3. Verify alt text on images
4. Check ARIA labels and roles

### 3. Color and Contrast
1. Test with high contrast mode
2. Verify color contrast ratios
3. Test without color (grayscale)
4. Check for color-only information

## Browser Compatibility Testing

### Supported Browsers
- Chrome 90+
- Firefox 90+  
- Safari 14+
- Edge 90+

### Testing Checklist
1. Test core functionality in each browser
2. Verify PWA features work
3. Check for browser-specific bugs
4. Test on different operating systems

## Deployment Testing

### 1. Production Build
```bash
npm run build
```
- Should complete without errors
- Check bundle sizes are reasonable
- Verify all assets are optimized

### 2. Staging Deployment
1. Deploy to staging environment
2. Test with production data
3. Verify environment variables
4. Check SSL certificates

### 3. Production Deployment
1. Test with real users
2. Monitor error logs
3. Check performance metrics
4. Verify analytics tracking

## Testing Checklist

### Pre-Launch
- [ ] All tests pass locally
- [ ] PWA audit score >90
- [ ] Works offline
- [ ] Mobile responsive
- [ ] Accessible (WCAG AA)
- [ ] Cross-browser compatible
- [ ] Performance optimized

### Post-Launch
- [ ] Real user monitoring active
- [ ] Error tracking configured
- [ ] Analytics implemented
- [ ] User feedback collected
- [ ] Performance monitored
- [ ] Security scanning completed

## Common Issues and Solutions

### PWA Not Installing
- Check manifest.json is valid
- Verify HTTPS is working
- Ensure service worker registers
- Check browser compatibility

### Service Worker Not Updating
- Check service worker cache strategy
- Verify skipWaiting() implementation
- Test in incognito mode
- Clear browser cache manually

### Upload Failures
- Check file size limits
- Verify Firebase Storage rules
- Test network connectivity
- Check authentication tokens

### Performance Issues
- Analyze bundle size
- Check for memory leaks
- Optimize images and assets
- Review network requests

## Reporting Issues
When reporting issues, include:
1. Browser and version
2. Device type and OS
3. Steps to reproduce
4. Expected vs actual behavior
5. Console errors/screenshots
6. Network conditions

## Monitoring and Analytics

### Error Tracking
- Configure Sentry or similar
- Monitor console errors
- Track API failures
- Log user actions

### Performance Metrics
- Core Web Vitals
- Page load times
- User engagement
- Conversion rates

### User Feedback
- In-app feedback forms
- User surveys
- Support tickets
- App store reviews