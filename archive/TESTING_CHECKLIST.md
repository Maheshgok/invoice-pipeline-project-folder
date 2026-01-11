# 🧪 Testing Checklist - Queue-Based Invoice Processing

## ✅ **Pre-Testing Setup**

### 1. Verify Services are Running
- [ ] **Queue Processor**: `https://queue-processor-545188726513.asia-south1.run.app/health`
- [ ] **Initial API**: `https://initial-api-545188726513.asia-south1.run.app/health`
- [ ] **Netlify Functions**: Deploy latest code to Netlify

### 2. Environment Variables Check
- [ ] **Netlify**: `GOOGLE_CLIENT_ID` set
- [ ] **Queue Processor**: `RATE_LIMIT_PER_MINUTE`, `GOOGLE_CLIENT_ID`, `OPENAI_API_KEY` set

---

## 🔄 **Testing Flow**

### Step 1: Basic Upload Test
1. [ ] Open `https://invoiceparse.netlify.app`
2. [ ] Sign in with Google account
3. [ ] Upload a test invoice (PDF/JPG/PNG)
4. [ ] **Expected**: File uploads successfully, job ID returned

### Step 2: Queue Integration Test
1. [ ] After upload, observe progress bar appears
2. [ ] **Expected**: Status shows "pending" → "processing" 
3. [ ] **Expected**: Progress bar updates from 0% to 100%
4. [ ] **Expected**: Processing steps are visible

### Step 3: Progress Tracking Test
1. [ ] Watch for real-time progress updates
2. [ ] **Expected**: Progress increments smoothly
3. [ ] **Expected**: Step indicators show current stage
4. [ ] **Expected**: Polling happens every 2.5 seconds

### Step 4: Completion Test
1. [ ] Wait for processing to complete
2. [ ] **Expected**: Status changes to "completed"
3. [ ] **Expected**: Progress bar reaches 100%
4. [ ] **Expected**: Invoice data appears in table

---

## 🚨 **Error Testing**

### Test Invalid File Upload
1. [ ] Try uploading non-image/PDF file
2. [ ] **Expected**: Clear error message

### Test Network Issues
1. [ ] Simulate network interruption during upload
2. [ ] **Expected**: Retry logic with exponential backoff

### Test Authentication
1. [ ] Try accessing without login
2. [ ] **Expected**: Proper authentication error

---

## 📊 **Monitoring During Tests**

### Check Logs
- [ ] **Netlify Functions**: Check function logs for errors
- [ ] **Queue Processor**: Monitor Cloud Run logs
- [ ] **Browser Console**: Watch for API call logs

### Verify Queue Behavior
- [ ] **Rate Limiting**: Should respect 1000 req/min limit
- [ ] **FIFO Processing**: Jobs processed in order
- [ ] **Single Concurrency**: Only one OpenAI call at a time

---

## 🎯 **Success Criteria**

### Must Work:
- [ ] ✅ **Upload**: File successfully uploaded to bucket
- [ ] ✅ **Queue**: Job added to user's Firestore queue
- [ ] ✅ **Processing**: Queue processor picks up and processes job
- [ ] ✅ **Progress**: Real-time updates from 0% to 100%
- [ ] ✅ **Results**: Invoice data extracted and displayed
- [ ] ✅ **UI/UX**: Smooth, informative user experience

### Performance Targets:
- [ ] 📈 **Upload Time**: < 5 seconds
- [ ] 📈 **Queue Wait**: Minimal for single user
- [ ] 📈 **Processing**: 30-60 seconds for typical invoice
- [ ] 📈 **UI Responsiveness**: No blocking, smooth updates

---

## 🐛 **Common Issues to Watch For**

1. **CORS Errors**: Check Netlify function headers
2. **Authentication Failures**: Verify Google Client ID
3. **Rate Limiting**: Watch for 429 errors from OpenAI
4. **Queue Stuck**: Check Firestore permissions
5. **Progress Not Updating**: Verify polling logic

---

## 📝 **Test Results Log**

**Date**: ___________  
**Tester**: ___________

| Test Case | Status | Notes |
|-----------|--------|-------|
| Basic Upload | ⬜ Pass / ⬜ Fail | |
| Queue Integration | ⬜ Pass / ⬜ Fail | |
| Progress Tracking | ⬜ Pass / ⬜ Fail | |
| Error Handling | ⬜ Pass / ⬜ Fail | |
| Performance | ⬜ Pass / ⬜ Fail | |

**Overall Result**: ⬜ **Ready for Production** / ⬜ **Needs Fixes**

---

*💡 If any issues are found, check the logs first, then refer to the API documentation in `API_ENDPOINTS_REFERENCE.md`*