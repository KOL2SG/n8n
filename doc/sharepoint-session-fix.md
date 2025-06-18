# SharePoint OAuth Session Timeout Fix

## Overview

This document describes a fix for SharePoint OAuth authentication session timeout issues in n8n. The problem manifests as SharePoint connections working initially but losing authentication after a few minutes due to OAuth token refresh failures.

## Problem Description

### Symptoms
- SharePoint OAuth authentication works initially after setup
- Connections fail after approximately 60 minutes (typical OAuth token expiration)
- Error messages related to authentication or unauthorized access when accessing SharePoint
- Users need to re-authenticate frequently

### Root Cause
SharePoint's OAuth2 implementation requires client credentials to be included in the request **body** (not headers) during token refresh operations. The default n8n OAuth refresh behavior includes credentials in the Authorization header, which SharePoint rejects.

## Technical Background

### OAuth2 Token Refresh Process
1. **Initial Authentication**: User authenticates with SharePoint, receives access token + refresh token
2. **Token Expiration**: Access token expires (typically after 1 hour)
3. **Automatic Refresh**: n8n attempts to refresh the token using the refresh token
4. **Failure Point**: SharePoint rejects the refresh request because credentials are in headers instead of request body

### SharePoint OAuth Requirements
Microsoft SharePoint OAuth2 follows a specific pattern for token refresh:
- Client credentials (`client_id` and `client_secret`) must be in the request body
- Authorization header must be cleared during refresh requests
- Content-Type must be `application/x-www-form-urlencoded`

## Solution Implementation

### Code Changes
The fix was implemented in `/packages/nodes-base/nodes/HttpRequest/GenericFunctions.ts` in the `getOAuth2AdditionalParameters` function.

**Before (missing SharePoint configuration):**
```typescript
export const getOAuth2AdditionalParameters = (nodeCredentialType: string) => {
	const oAuth2Options: { [credentialType: string]: IOAuth2Options } = {
		microsoftDynamicsOAuth2Api: {
			property: 'id_token',
		},
		philipsHueOAuth2Api: {
			tokenType: 'Bearer',
		},
		// SharePoint was missing!
	};
	return oAuth2Options[nodeCredentialType];
};
```

**After (with SharePoint fix):**
```typescript
export const getOAuth2AdditionalParameters = (nodeCredentialType: string) => {
	const oAuth2Options: { [credentialType: string]: IOAuth2Options } = {
		microsoftDynamicsOAuth2Api: {
			property: 'id_token',
		},
		microsoftSharePointOAuth2Api: {
			includeCredentialsOnRefreshOnBody: true,
		},
		philipsHueOAuth2Api: {
			tokenType: 'Bearer',
		},
	};
	return oAuth2Options[nodeCredentialType];
};
```

### How the Fix Works
When `includeCredentialsOnRefreshOnBody: true` is set, the OAuth refresh logic in `/packages/core/src/execution-engine/node-execution-context/utils/request-helper-functions.ts` will:

1. **Include credentials in request body**:
   ```typescript
   const body: IDataObject = {
       client_id: credentials.clientId,
       client_secret: credentials.clientSecret,
   };
   tokenRefreshOptions.body = body;
   ```

2. **Clear Authorization header**:
   ```typescript
   tokenRefreshOptions.headers = {
       Authorization: '',
   };
   ```

3. **Use proper Content-Type**: The system automatically sets `application/x-www-form-urlencoded`

## Services Using This Pattern

The `includeCredentialsOnRefreshOnBody: true` setting is used by several other OAuth providers that have similar requirements:

- **Box OAuth2 API** - `boxOAuth2Api`
- **HubSpot OAuth2 API** - `hubspotOAuth2Api` and `hubspotDeveloperApi`
- **Mautic OAuth2 API** - `mauticOAuth2Api`
- **Raindrop OAuth2 API** - `raindropOAuth2Api`
- **Strava OAuth2 API** - `stravaOAuth2Api`
- **Microsoft SharePoint OAuth2 API** - `microsoftSharePointOAuth2Api` (newly added)

## Installation and Testing

### Applying the Fix
1. **Update the code** with the changes described above
2. **Restart n8n** to load the updated configuration
3. **Test SharePoint connections** after the restart

### Testing the Fix
1. **Set up SharePoint OAuth credential** (if not already done)
2. **Create a workflow** that accesses SharePoint data
3. **Wait for token expiration** (approximately 1 hour) or manually trigger a refresh
4. **Verify continued access** - the workflow should continue working without re-authentication

### Expected Behavior After Fix
- ✅ **Initial authentication works** as before
- ✅ **Automatic token refresh succeeds** after expiration
- ✅ **Long-running workflows continue** without authentication interruption
- ✅ **No manual re-authentication required** for normal token expiration cycles

## Troubleshooting

### Verifying the Fix is Applied
Check that the `getOAuth2AdditionalParameters` function includes the SharePoint configuration:
```bash
# Search for the SharePoint configuration in the built files
grep -r "microsoftSharePointOAuth2Api" ./packages/nodes-base/dist/
```

### Testing Token Refresh Manually
If you need to test token refresh behavior:
1. **Enable debug logging** for OAuth operations
2. **Monitor network requests** during SharePoint operations
3. **Look for refresh token requests** in the logs
4. **Verify request format** - credentials should be in body, not headers

### Common Issues After Fix

#### 1. Fix Not Taking Effect
**Symptom**: SharePoint still fails after token expiration
**Solution**: 
- Ensure n8n was fully restarted after code changes
- Clear browser cache and re-authenticate SharePoint credential
- Verify the fix is in the correct file location

#### 2. Other Microsoft Services Affected
**Symptom**: Other Microsoft OAuth integrations stop working
**Solution**: 
- This fix is SharePoint-specific and shouldn't affect other services
- Other Microsoft services (Dynamics, Azure Monitor) have their own configurations
- If issues occur, verify the `getOAuth2AdditionalParameters` function syntax

#### 3. SharePoint Authentication Still Failing
**Symptom**: SharePoint fails even during initial authentication
**Solution**:
- This fix only addresses token refresh, not initial authentication
- Check SharePoint credential configuration (client ID, secret, redirect URI)
- Verify SharePoint app permissions and tenant settings

## Related Microsoft Services

### Current Microsoft OAuth Configurations
- **Microsoft Dynamics**: Uses `property: 'id_token'` for ID token handling
- **Microsoft Azure Monitor**: Uses `tokenExpiredStatusCode: 403` for error detection
- **Microsoft SharePoint**: Uses `includeCredentialsOnRefreshOnBody: true` for token refresh
- **Other Microsoft services** (Excel, OneDrive, Outlook): Use standard OAuth2 refresh (no special config)

### Future Considerations
If other Microsoft services experience similar token refresh issues, they may need the same `includeCredentialsOnRefreshOnBody: true` configuration. Monitor for similar patterns across the Microsoft ecosystem.

## Security Implications

### Credential Handling
- **No security risk**: The fix changes where credentials are sent (body vs header) but doesn't expose them
- **Standard OAuth practice**: Including credentials in request body is the OAuth2 standard
- **Microsoft requirement**: SharePoint specifically requires this format for compliance

### Audit Considerations
- **Authentication events**: Token refresh happens transparently, no user interaction required
- **Logging**: OAuth refresh events can be logged for audit purposes if needed
- **Credential rotation**: Standard SharePoint credential rotation procedures still apply

## Performance Impact

### Minimal Performance Impact
- **Same number of requests**: Fix doesn't change request frequency
- **Slightly different request format**: Negligible performance difference
- **Improved reliability**: Reduces failed requests due to authentication errors

### Monitoring Recommendations
- **Track authentication failures**: Monitor for OAuth-related errors
- **Token refresh success rate**: Should improve significantly after fix
- **SharePoint operation reliability**: Should see fewer timeout/auth errors

## References

- **OAuth2 RFC 6749**: Standards for token refresh procedures
- **Microsoft SharePoint OAuth Documentation**: Microsoft-specific implementation details
- **n8n OAuth Implementation**: Core OAuth handling in request-helper-functions.ts
- **Issue Pattern**: Similar to Box, HubSpot, and other providers requiring body credentials