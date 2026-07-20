# citadelMD E2E Testing Guide

## Current Test Status

✅ **API Tests**: All passing  
✅ **Basic Authentication**: Working  
✅ **Frontend Loading**: Working  
⚠️ **JavaScript Errors**: Need monitoring  

## Test Infrastructure

### 1. Simple API Tests
```bash
# Run basic API and functionality tests
./apps/web/e2e/simple-test.sh
```

### 2. Manual Browser Tests
1. Open http://localhost:8081
2. Login with admin/admin123  
3. Open Browser DevTools (F12) → Console tab
4. Navigate through:
   - Dashboard
   - Admin Users  
   - Profile
   - Click on "Root" folder
5. Monitor console for JavaScript errors

### 3. Future Playwright Tests
```bash
# When @playwright/test is installed:
cd apps/web
npm run test:install    # Install browser binaries
npm run test:e2e       # Run all e2e tests  
npm run test:e2e:ui    # Run with UI mode
npm run test:e2e:debug # Run in debug mode
```

## Test Files Created

- `apps/web/e2e/playwright.config.ts` - Playwright configuration
- `apps/web/e2e/auth.spec.ts` - Authentication tests
- `apps/web/e2e/dashboard.spec.ts` - Dashboard functionality tests  
- `apps/web/e2e/simple-test.sh` - Basic API/curl tests

## JavaScript Error Monitoring

The tests specifically check for:
- Console errors during page load
- Errors during authentication
- Errors during navigation
- Errors when clicking UI elements
- React rendering errors
- API call failures

## Known Issues Resolved

✅ **Fixed**: `d.map is not a function` error  
✅ **Fixed**: API proxy configuration in nginx  
✅ **Fixed**: Port conflicts (moved to 8081)  
✅ **Fixed**: Authentication flow working  

## Next Steps

1. **Install Playwright**: `npm install @playwright/test` when network allows
2. **Run full test suite**: Automated browser testing
3. **Add visual regression tests**: Screenshots comparison
4. **CI/CD Integration**: Automated testing in pipeline
5. **Performance monitoring**: Load time and memory usage

## Manual Testing Checklist

- [ ] Login/logout functionality
- [ ] Navigation between pages  
- [ ] Folder tree interaction
- [ ] Document creation (when implemented)
- [ ] Error handling (wrong credentials, network failures)
- [ ] Browser compatibility (Chrome, Firefox, Safari)
- [ ] Responsive design (mobile, tablet views)