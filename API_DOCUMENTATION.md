# EmailVerse API Documentation

## Overview

The EmailVerse API provides endpoints for transforming documents into explorable email universes. Upload documents, generate characters, and retrieve simulated email communications.

**Base URL:** `http://localhost:3000`

**API Version:** 0.1.0

---

## Authentication

Currently, the API does not require authentication. All endpoints are publicly accessible.

---

## Endpoints

### 1. Health Check

Check if the API is running.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-21T10:30:00.000Z"
}
```

**Status Codes:**
- `200 OK` - API is healthy

---

### 2. Create Universe

Upload documents and initiate universe generation.

**Endpoint:** `POST /api/universes`

**Request Body (multipart/form-data):**
```
documents: File[] (PDF, TXT, or MD files)
config: JSON (optional)
```

**Config Structure (optional):**
```json
{
  "targetEmails": 50,
  "timeoutMs": 300000,
  "tickDurationHours": 24
}
```

**Response:**
```json
{
  "universeId": "uuid-string",
  "status": "processing",
  "message": "Universe generation started"
}
```

**Status Codes:**
- `201 Created` - Universe creation initiated
- `400 Bad Request` - Invalid request (no documents, wrong format)
- `500 Internal Server Error` - Server error

**Example (curl):**
```bash
curl -X POST http://localhost:3000/api/universes \
  -F "documents=@paper.pdf" \
  -F "documents=@notes.txt" \
  -F 'config={"targetEmails":100}'
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('documents', pdfFile);
formData.append('documents', txtFile);
formData.append('config', JSON.stringify({ targetEmails: 50 }));

const response = await fetch('http://localhost:3000/api/universes', {
  method: 'POST',
  body: formData
});

const { universeId } = await response.json();
```

---

### 3. Get Universe Status

Check the generation progress of a universe.

**Endpoint:** `GET /api/universes/:universeId/status`

**Path Parameters:**
- `universeId` (string, required) - Universe identifier

**Response:**
```json
{
  "universeId": "uuid-string",
  "status": "processing",
  "progress": {
    "phase": "simulation",
    "percentComplete": 65,
    "currentTask": "Generating emails",
    "subTask": "Email 33 of 50",
    "itemsProcessed": 33,
    "itemsTotal": 50
  },
  "startedAt": "2024-01-21T10:30:00.000Z",
  "lastActivityAt": "2024-01-21T10:35:00.000Z"
}
```

**Status Values:**
- `processing` - Generation in progress
- `complete` - Universe ready
- `failed` - Generation failed

**Phase Values:**
- `documents` - Processing documents
- `characters` - Generating characters
- `simulation` - Running simulation
- `complete` - All done

**Status Codes:**
- `200 OK` - Status retrieved
- `404 Not Found` - Universe not found

**Example (curl):**
```bash
curl http://localhost:3000/api/universes/uuid-string/status
```

**Polling Example:**
```javascript
async function waitForCompletion(universeId) {
  while (true) {
    const response = await fetch(`/api/universes/${universeId}/status`);
    const { status, progress } = await response.json();
    
    console.log(`${progress.phase}: ${progress.percentComplete}%`);
    
    if (status === 'complete') return true;
    if (status === 'failed') throw new Error('Generation failed');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

---

### 4. Get Emails

Retrieve generated emails from a universe.

**Endpoint:** `GET /api/universes/:universeId/emails`

**Path Parameters:**
- `universeId` (string, required) - Universe identifier

**Query Parameters:**
- `folder` (string, optional) - Filter by folder type
  - Values: `inbox`, `sent`, `spam`, `newsletters`, `all`
  - Default: `all`
- `characterId` (string, optional) - Filter emails by character
- `limit` (number, optional) - Max emails to return (default: 100)
- `offset` (number, optional) - Pagination offset (default: 0)

**Response:**
```json
{
  "emails": [
    {
      "id": "email-uuid",
      "from": {
        "characterId": "char-uuid",
        "displayName": "Dr. Sarah Chen",
        "email": "sarah.chen@research.org"
      },
      "to": [
        {
          "characterId": "char-uuid-2",
          "displayName": "Marcus Webb",
          "email": "m.webb@company.com"
        }
      ],
      "subject": "Re: Data Analysis Results",
      "body": "Marcus, I've reviewed the findings...",
      "timestamp": "2024-01-15T14:30:00.000Z",
      "threadId": "thread-uuid",
      "type": "reply",
      "sentiment": "neutral",
      "folder": "inbox"
    }
  ],
  "total": 50,
  "limit": 100,
  "offset": 0
}
```

**Email Fields:**
- `id` - Unique email identifier
- `from` - Sender information
- `to` - Array of recipients
- `cc` - Array of CC recipients (optional)
- `subject` - Email subject line
- `body` - Email content
- `timestamp` - When email was sent (ISO 8601)
- `threadId` - Conversation thread identifier
- `inReplyTo` - ID of email this replies to (optional)
- `type` - Email type: `initial`, `reply`, `forward`, `newsletter`, `automated`
- `sentiment` - Emotional tone: `positive`, `negative`, `neutral`, `mixed`
- `folder` - Folder classification

**Status Codes:**
- `200 OK` - Emails retrieved
- `404 Not Found` - Universe not found
- `400 Bad Request` - Invalid parameters

**Example (curl):**
```bash
# Get all emails
curl http://localhost:3000/api/universes/uuid-string/emails

# Get inbox emails only
curl http://localhost:3000/api/universes/uuid-string/emails?folder=inbox

# Get emails with pagination
curl http://localhost:3000/api/universes/uuid-string/emails?limit=20&offset=40
```

**Example (JavaScript):**
```javascript
// Fetch inbox emails
const response = await fetch(
  `/api/universes/${universeId}/emails?folder=inbox`
);
const { emails, total } = await response.json();

console.log(`Found ${total} inbox emails`);
emails.forEach(email => {
  console.log(`${email.from.displayName}: ${email.subject}`);
});
```

---

### 5. Get Thread

Retrieve all emails in a conversation thread.

**Endpoint:** `GET /api/universes/:universeId/threads/:threadId`

**Path Parameters:**
- `universeId` (string, required) - Universe identifier
- `threadId` (string, required) - Thread identifier

**Response:**
```json
{
  "thread": {
    "id": "thread-uuid",
    "subject": "Data Analysis Results",
    "participants": [
      {
        "characterId": "char-uuid-1",
        "name": "Dr. Sarah Chen",
        "email": "sarah.chen@research.org"
      },
      {
        "characterId": "char-uuid-2",
        "name": "Marcus Webb",
        "email": "m.webb@company.com"
      }
    ],
    "emailCount": 5,
    "startedAt": "2024-01-15T10:00:00.000Z",
    "lastActivityAt": "2024-01-15T16:30:00.000Z"
  },
  "emails": [
    {
      "id": "email-1",
      "from": {...},
      "subject": "Data Analysis Results",
      "body": "...",
      "timestamp": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Thread retrieved
- `404 Not Found` - Universe or thread not found

---

### 6. Get Characters

Retrieve all characters in a universe.

**Endpoint:** `GET /api/universes/:universeId/characters`

**Path Parameters:**
- `universeId` (string, required) - Universe identifier

**Response:**
```json
{
  "characters": [
    {
      "id": "char-uuid",
      "name": "Dr. Sarah Chen",
      "email": "sarah.chen@research.org",
      "role": "Lead Researcher",
      "archetype": "the_analyst",
      "personality": {
        "traits": ["analytical", "methodical", "collaborative"],
        "communicationStyle": "formal"
      },
      "goals": ["Publish research findings", "Secure funding"],
      "boundModel": "gpt-4o-mini"
    }
  ],
  "total": 8
}
```

**Status Codes:**
- `200 OK` - Characters retrieved
- `404 Not Found` - Universe not found

---

### 7. Get Relationships

Retrieve character relationships in a universe.

**Endpoint:** `GET /api/universes/:universeId/relationships`

**Path Parameters:**
- `universeId` (string, required) - Universe identifier

**Response:**
```json
{
  "relationships": [
    {
      "characterA": {
        "id": "char-uuid-1",
        "name": "Dr. Sarah Chen"
      },
      "characterB": {
        "id": "char-uuid-2",
        "name": "Marcus Webb"
      },
      "type": "professional",
      "strength": 0.7,
      "sentiment": "positive"
    }
  ],
  "total": 12
}
```

**Relationship Types:**
- `professional` - Work relationship
- `personal` - Personal connection
- `adversarial` - Opposing views
- `collaborative` - Working together
- `hierarchical` - Superior/subordinate

**Status Codes:**
- `200 OK` - Relationships retrieved
- `404 Not Found` - Universe not found

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

**Common Error Codes:**
- `400 Bad Request` - Invalid request parameters
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

---

## Rate Limits

Currently, there are no rate limits. This may change in future versions.

---

## WebSocket Support

Real-time updates for universe generation progress coming in future versions.

---

## Example Workflows

### Complete Universe Generation

```javascript
// 1. Upload documents
const formData = new FormData();
formData.append('documents', file1);
formData.append('documents', file2);

const createResponse = await fetch('/api/universes', {
  method: 'POST',
  body: formData
});

const { universeId } = await createResponse.json();

// 2. Poll for completion
let status = 'processing';
while (status === 'processing') {
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const statusResponse = await fetch(`/api/universes/${universeId}/status`);
  const data = await statusResponse.json();
  status = data.status;
  
  console.log(`Progress: ${data.progress.percentComplete}%`);
}

// 3. Fetch generated emails
const emailsResponse = await fetch(`/api/universes/${universeId}/emails`);
const { emails } = await emailsResponse.json();

console.log(`Generated ${emails.length} emails`);
```

### Filter and Display Emails

```javascript
// Get inbox emails only
const inbox = await fetch(
  `/api/universes/${universeId}/emails?folder=inbox`
).then(r => r.json());

// Group by thread
const threadMap = new Map();
inbox.emails.forEach(email => {
  if (!threadMap.has(email.threadId)) {
    threadMap.set(email.threadId, []);
  }
  threadMap.get(email.threadId).push(email);
});

// Display threads
threadMap.forEach((emails, threadId) => {
  console.log(`Thread: ${emails[0].subject} (${emails.length} emails)`);
  emails.forEach(email => {
    console.log(`  - ${email.from.displayName}: ${email.body.slice(0, 50)}...`);
  });
});
```

---

## SDK Support

Official SDKs coming soon for:
- TypeScript/JavaScript
- Python
- Go

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/CrazyDubya/genMail/issues
- Documentation: https://github.com/CrazyDubya/genMail

---

**Last Updated:** 2026-01-22  
**API Version:** 0.1.0
