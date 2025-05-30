# Microsoft Teams Node - Least Privilege Implementation

## Overview

This document outlines the implementation of least privilege principles for the n8n Microsoft Teams node. Following security best practices, we've minimized the permissions requested by the node to only those absolutely necessary for core functionality.

## Permission Changes

### Previous OAuth2 Scopes

```
openid offline_access User.ReadWrite.All Group.ReadWrite.All Chat.ReadWrite
```

### New Least Privilege OAuth2 Scopes

```
openid offline_access User.ReadBasic.All GroupMember.Read.All Chat.Read
```

### Permissions for Microsoft Teams Trigger (unchanged)

Trigger functionality still requires these permissions:
- `ChannelMessage.Read.All`
- `Chat.Read.All`
- `Team.ReadBasic.All`
- `Subscription.ReadWrite.All`

## Justification for Permission Changes

| Previous Permission | New Permission | Justification |
| --- | --- | --- |
| `User.ReadWrite.All` | `User.ReadBasic.All` | The Teams node primarily needs basic user properties (ObjectId, UserPrincipalName, Display Name, etc.). Write access is not required for core functionality. |
| `Group.ReadWrite.All` | `GroupMember.Read.All` | The `Group.Read.All` permission is blacklisted as it includes access to all M365 related services. `GroupMember.Read.All` provides access to Teams, their members and basic properties without excessive permissions. |
| `Chat.ReadWrite` | `Chat.Read` | Most Teams operations only need to read chat messages; write operations can be handled separately when explicitly required. |

## Microsoft Graph API Permission Details

### User.ReadBasic.All

Allows the app to read basic profiles of all users in the organization, including:
- ObjectId
- UserPrincipalName
- Display Name
- First and Last Name
- Email Address
- Profile Photo

### GroupMember.Read.All

Allows the app to:
- List all Teams (groups)
- Read group member information
- Access basic team properties

Without allowing access to shared files or other sensitive Teams content.

### Chat.Read

Allows the app to:
- Read chat messages
- Access chat thread information

Without allowing message creation or modification.

## Feature Impact

### Supported Operations
- Listing Teams
- Getting Team members
- Reading chat and channel messages
- Accessing basic user information

### Limited Operations
- Operations requiring write access to users must be authenticated separately
- Creating or modifying chat messages requires elevated permissions

## Security Benefits

1. **Reduced Attack Surface**: Limiting permissions reduces the potential impact of credential compromise
2. **Data Protection**: Prevents inadvertent access to sensitive M365 content
3. **Compliance**: Satisfies security requirements for least privilege access

## Requesting Elevated Permissions

If specific write operations are absolutely necessary, users should:

1. Create a separate app registration in Microsoft Entra ID
2. Request only the specific elevated permissions needed
3. Provide clear business justification
4. Use a separate credential for these specific operations

## Implementation Details

The changes have been implemented in:
- `/packages/nodes-base/credentials/MicrosoftTeamsOAuth2Api.credentials.ts`

By modifying the default OAuth scopes from high-privilege to least-privilege alternatives.
