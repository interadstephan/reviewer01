import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { DevOpsClient } from "../src/devops-client";
import { OpenAIClient } from "../src/openai-client";
import { ReviewService } from "../src/review-service";

export async function PRReviewFunction(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("PR Review Function triggered");

  try {
    // Validate required environment variables
    const devOpsToken = process.env.AZURE_DEVOPS_PAT;
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const devOpsOrg = process.env.AZURE_DEVOPS_ORG;
    const devOpsProject = process.env.AZURE_DEVOPS_PROJECT;

    if (!devOpsToken || !openAiApiKey || !devOpsOrg || !devOpsProject) {
      return {
        status: 400,
        body: "Missing required environment variables: AZURE_DEVOPS_PAT, OPENAI_API_KEY, AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT",
      };
    }

    // Parse webhook payload from Azure DevOps
    const payload = (await request.json()) as any;

    if (!payload || !payload.resource) {
      return {
        status: 400,
        body: "Invalid webhook payload",
      };
    }

    const resource = payload.resource;
    const eventType = payload.eventType;

    // Only process pull request events
    if (
      !eventType ||
      (!eventType.includes("pullrequest.created") &&
        !eventType.includes("pullrequest.updated"))
    ) {
      context.log("Ignoring non-PR event:", eventType);
      return {
        status: 200,
        body: "Event ignored (not a PR creation/update event)",
      };
    }

    const pullRequestId = resource.pullRequestId;
    const repositoryId = resource.repository?.id;

    if (!pullRequestId || !repositoryId) {
      return {
        status: 400,
        body: "Missing pullRequestId or repositoryId in webhook payload",
      };
    }

    context.log(
      `Processing PR ${pullRequestId} in repository ${repositoryId}`
    );

    // Initialize clients
    const devOpsClient = new DevOpsClient(
      devOpsOrg,
      devOpsProject,
      devOpsToken
    );
    const openAIClient = new OpenAIClient(openAiApiKey);
    const reviewService = new ReviewService(
      devOpsClient,
      openAIClient,
      context
    );

    // Perform review
    await reviewService.reviewPullRequest(pullRequestId, repositoryId);

    return {
      status: 200,
      body: "PR review completed successfully",
    };
  } catch (error) {
    context.error("Error processing PR review:", error);
    return {
      status: 500,
      body: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

app.http("PRReviewFunction", {
  methods: ["POST"],
  authLevel: "function",
  handler: PRReviewFunction,
});
