# Architecture

This document describes the architecture and design of the Azure DevOps PR Reviewer.

## System Overview

```
┌─────────────────┐          ┌─────────────────┐
│  Azure DevOps   │          │  Azure Function │
│                 │          │                 │
│  Pull Request   │─────────▶│  PRReviewFunc   │
│  (Webhook)      │  HTTP    │                 │
└─────────────────┘          └────────┬────────┘
                                      │
                        ┌─────────────┼─────────────┐
                        │             │             │
                        ▼             ▼             ▼
              ┌──────────────┐ ┌───────────┐ ┌──────────────┐
              │   DevOps     │ │  OpenAI   │ │   Review     │
              │   Client     │ │  Client   │ │   Service    │
              └──────┬───────┘ └─────┬─────┘ └──────┬───────┘
                     │               │              │
                     ▼               ▼              │
              ┌──────────────┐ ┌───────────┐       │
              │ Azure DevOps │ │  OpenAI   │       │
              │  REST API    │ │  API      │       │
              │              │ │           │       │
              │ - Get PR     │ │ - Analyze │◀──────┘
              │ - Get Diffs  │ │   Code    │
              │ - Post       │ └───────────┘
              │   Comments   │
              └──────────────┘
```

## Components

### 1. Azure Function (PRReviewFunction)

**File**: `PRReviewFunction/index.ts`

**Responsibilities**:
- HTTP trigger endpoint for Azure DevOps webhooks
- Validates incoming webhook payloads
- Orchestrates the review process
- Error handling and logging

**Flow**:
1. Receives webhook POST request from Azure DevOps
2. Validates environment variables and payload
3. Extracts PR information (ID, repository)
4. Initializes clients and services
5. Delegates to ReviewService
6. Returns HTTP response

**Environment Variables Required**:
- `AZURE_DEVOPS_ORG`: Organization name
- `AZURE_DEVOPS_PROJECT`: Project name  
- `AZURE_DEVOPS_PAT`: Personal Access Token
- `OPENAI_API_KEY`: OpenAI API key

### 2. DevOps Client

**File**: `src/devops-client.ts`

**Responsibilities**:
- Interface with Azure DevOps REST API
- Authentication using PAT (Personal Access Token)
- Fetch PR iterations and changes
- Get file diffs
- Post review comments

**Key Methods**:

```typescript
class DevOpsClient {
  // Get all iterations for a PR
  getPullRequestIterations(repositoryId, pullRequestId)
  
  // Get changes for a specific iteration
  getIterationChanges(repositoryId, pullRequestId, iterationId)
  
  // Get diff for a file
  getFileDiff(repositoryId, pullRequestId, path)
  
  // Post a comment thread
  postCommentThread(repositoryId, pullRequestId, comment, filePath?, lineNumber?)
}
```

**API Endpoints Used**:
- `GET /git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations`
- `GET /git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations/{iterationId}/changes`
- `GET /git/repositories/{repositoryId}/diffs/commits`
- `POST /git/repositories/{repositoryId}/pullRequests/{pullRequestId}/threads`

### 3. OpenAI Client

**File**: `src/openai-client.ts`

**Responsibilities**:
- Interface with OpenAI API
- Analyze code changes
- Generate structured review comments
- Create PR summaries

**Key Methods**:

```typescript
class OpenAIClient {
  // Analyze a single file's changes
  analyzeCode(filePath, diff, changeType): CodeReviewResult
  
  // Generate overall PR summary
  generatePRSummary(fileReviews): string
}
```

**Review Output Structure**:

```typescript
interface CodeReviewResult {
  summary: string;
  comments: Array<{
    filePath: string;
    lineNumber?: number;
    comment: string;
    severity: "info" | "warning" | "critical";
  }>;
}
```

**AI Prompting**:
- Uses system prompt to define role and output format
- Configurable focus areas (security, performance, etc.)
- JSON-structured output for reliable parsing
- Temperature set low (0.3) for consistency

### 4. Review Service

**File**: `src/review-service.ts`

**Responsibilities**:
- Orchestrate the entire review process
- Filter files based on exclusion patterns
- Coordinate DevOps and OpenAI clients
- Handle errors and continue processing

**Flow**:

```
1. Get PR iterations
2. Get latest iteration changes
3. Filter excluded files
4. For each file:
   a. Get file diff
   b. Analyze with OpenAI
   c. Post review comments
5. Generate and post PR summary
```

**File Exclusion**:
- Uses minimatch for glob pattern matching
- Configurable in `config.json`
- Default patterns exclude minified, generated, and lock files

### 5. Configuration

**File**: `config.json`

**Structure**:

```json
{
  "review": {
    "depth": "detailed | brief",
    "tone": "constructive | strict | friendly",
    "excludedFiles": ["*.min.js", "**/dist/**", ...],
    "focusAreas": ["security", "performance", ...],
    "maxComments": 10
  },
  "openai": {
    "model": "gpt-4 | gpt-3.5-turbo",
    "maxTokens": 2000,
    "temperature": 0.3
  }
}
```

## Data Flow

### Pull Request Creation/Update

```
1. Developer creates/updates PR in Azure DevOps
2. Azure DevOps Service Hook triggers webhook
3. POST request sent to Azure Function

POST /api/PRReviewFunction
{
  "eventType": "git.pullrequest.created",
  "resource": {
    "pullRequestId": 123,
    "repository": { "id": "repo-id" },
    ...
  }
}

4. Function validates and processes:
   - Extract PR ID and repository ID
   - Initialize clients
   - Start review process

5. Get PR changes:
   GET /pullRequests/123/iterations
   GET /pullRequests/123/iterations/1/changes
   
   Response: [{
     "item": { "path": "/src/app.ts" },
     "changeType": "edit"
   }]

6. For each file:
   a. Get diff:
      GET /diffs/commits?path=/src/app.ts
      
   b. Send to OpenAI:
      POST https://api.openai.com/v1/chat/completions
      {
        "model": "gpt-4",
        "messages": [{
          "role": "system",
          "content": "You are a code reviewer..."
        }, {
          "role": "user", 
          "content": "Review this code: [diff]"
        }]
      }
      
   c. Parse AI response:
      {
        "summary": "Overall good...",
        "comments": [{
          "filePath": "/src/app.ts",
          "lineNumber": 42,
          "comment": "Consider...",
          "severity": "warning"
        }]
      }
      
   d. Post comments:
      POST /pullRequests/123/threads
      {
        "comments": [{ "content": "⚠️ WARNING: Consider..." }],
        "threadContext": {
          "filePath": "/src/app.ts",
          "rightFileStart": { "line": 42 }
        }
      }

7. Post summary:
   POST /pullRequests/123/threads
   {
     "comments": [{ 
       "content": "## 🤖 AI Code Review Summary\n\n..." 
     }]
   }

8. Return success response
```

## Security

### Authentication

**Azure DevOps**:
- Uses Personal Access Token (PAT)
- Token stored in environment variables
- Encoded as Basic Auth header
- Requires specific scopes:
  - Code (Read)
  - Pull Request Threads (Read & Write)

**OpenAI**:
- Uses API Key
- Stored in environment variables
- Sent as Bearer token

**Azure Function**:
- Function-level authentication (code in URL)
- Can be upgraded to system-level authentication
- HTTPS enforced by default

### Data Handling

- No code or diffs stored permanently
- Processed in-memory only
- Logs may contain file names (not content)
- PII not collected or stored

### Best Practices

1. **Use Azure Key Vault** for production secrets
2. **Rotate tokens** regularly (90 days recommended)
3. **Use Managed Identity** when possible
4. **Enable Application Insights** for monitoring
5. **Set up alerts** for failures

## Scalability

### Current Architecture

- **Consumption Plan**: Auto-scales based on demand
- **Concurrent Executions**: Up to 200 per region
- **Execution Timeout**: 5 minutes default
- **Memory**: 1.5 GB per instance

### Scaling Considerations

**For High-Volume Scenarios**:

1. **Upgrade to Premium Plan**:
   - No cold starts
   - More memory per instance
   - VNet integration

2. **Implement Queueing**:
   - Use Azure Queue Storage
   - Function reads from queue
   - Better handling of spikes

3. **Add Caching**:
   - Cache file analysis results
   - Use Redis for shared cache
   - Reduce duplicate API calls

4. **Parallel Processing**:
   - Process multiple files concurrently
   - Use Promise.all() for parallel API calls

### Performance Optimization

**Current Performance**:
- Small PR (1-3 files): ~30-60 seconds
- Medium PR (5-10 files): ~2-4 minutes
- Large PR (20+ files): ~5-10 minutes

**Optimization Strategies**:

1. **Reduce API Calls**:
   - Batch file processing
   - Cache repeated requests
   - Use incremental diffs

2. **Optimize AI Requests**:
   - Use GPT-3.5-turbo for faster responses
   - Reduce maxTokens for shorter responses
   - Set lower depth for brief reviews

3. **Filter Aggressively**:
   - Exclude more file patterns
   - Skip very large files
   - Focus on changed lines only

## Error Handling

### Strategies

1. **Graceful Degradation**:
   - Continue processing other files if one fails
   - Post partial results
   - Log errors without failing entire PR

2. **Retry Logic**:
   - Automatic retries for transient failures
   - Exponential backoff
   - Maximum retry attempts

3. **Error Reporting**:
   - Log all errors to Application Insights
   - Post error comments to PR (optional)
   - Alert on critical failures

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid or expired PAT | Rotate token, check scopes |
| 404 Not Found | PR or repo doesn't exist | Verify IDs in webhook payload |
| 429 Too Many Requests | Rate limit hit | Implement backoff, upgrade plan |
| 500 Server Error | Azure/OpenAI service issue | Retry with exponential backoff |
| Timeout | Large PR or slow API | Increase timeout, use Premium plan |

## Monitoring

### Key Metrics

1. **Function Metrics**:
   - Execution count
   - Duration
   - Success/failure rate
   - Cold start frequency

2. **API Metrics**:
   - DevOps API call count
   - OpenAI API call count
   - API latency
   - Error rates

3. **Business Metrics**:
   - PRs reviewed per day
   - Comments posted per PR
   - Critical issues found
   - Time to review

### Logging

**Logged Information**:
- Function invocations
- PR IDs and repository IDs
- File counts (before/after filtering)
- API call results
- Errors and warnings

**Log Levels**:
- INFO: Normal operations
- WARN: Recoverable issues
- ERROR: Failures requiring attention

## Testing

### Manual Testing

1. **Local Testing**:
   ```bash
   npm start
   curl -X POST http://localhost:7071/api/PRReviewFunction \
     -d @test-payload-example.json
   ```

2. **Integration Testing**:
   - Create test PR in Azure DevOps
   - Trigger webhook manually
   - Verify comments posted

### Automated Testing (Future)

- Unit tests for each component
- Integration tests for API clients
- End-to-end tests with mocked APIs
- Load testing for scalability

## Future Enhancements

### High Priority

1. **Incremental Reviews**:
   - Only review changed files in updates
   - Track reviewed commits
   - Avoid duplicate comments

2. **Conversation Threading**:
   - Reply to existing threads
   - Mark issues as resolved
   - Track comment history

3. **Customizable Prompts**:
   - User-defined review templates
   - Project-specific guidelines
   - Language-specific prompts

### Medium Priority

1. **Multi-Provider Support**:
   - GitHub integration
   - GitLab integration
   - Bitbucket support

2. **Advanced Filtering**:
   - Review only changed lines
   - Focus on specific file types
   - Language-specific rules

3. **Analytics Dashboard**:
   - Review statistics
   - Common issues found
   - Team insights

### Low Priority

1. **IDE Integration**:
   - VS Code extension
   - IntelliJ plugin

2. **Custom AI Providers**:
   - Claude support
   - Gemini support
   - Local models

3. **Learning Mode**:
   - Learn from manual reviews
   - Improve suggestions over time
   - Team-specific preferences

## Conclusion

This architecture provides a solid foundation for AI-powered PR reviews with:
- ✅ Separation of concerns
- ✅ Easy to extend and maintain
- ✅ Scalable and reliable
- ✅ Secure by default
- ✅ Cost-effective

For questions or suggestions, please open an issue on GitHub.
