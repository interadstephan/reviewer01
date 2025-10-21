import { InvocationContext } from "@azure/functions";
import { DevOpsClient } from "./devops-client";
import { OpenAIClient, CodeReviewResult } from "./openai-client";
import config from "../config.json";
import { minimatch } from "minimatch";

export class ReviewService {
  constructor(
    private devOpsClient: DevOpsClient,
    private openAIClient: OpenAIClient,
    private context: InvocationContext
  ) {}

  /**
   * Main method to review a pull request
   */
  async reviewPullRequest(
    pullRequestId: number,
    repositoryId: string
  ): Promise<void> {
    this.context.log(
      `Starting review for PR ${pullRequestId} in repo ${repositoryId}`
    );

    try {
      // Get the latest iteration
      const iterations = await this.devOpsClient.getPullRequestIterations(
        repositoryId,
        pullRequestId
      );

      if (!iterations || iterations.length === 0) {
        this.context.log("No iterations found for this PR");
        return;
      }

      const latestIteration = iterations[iterations.length - 1];
      this.context.log(`Using iteration ${latestIteration.id}`);

      // Get changes for the latest iteration
      const changes = await this.devOpsClient.getIterationChanges(
        repositoryId,
        pullRequestId,
        latestIteration.id
      );

      if (!changes || !changes.changes || changes.changes.length === 0) {
        this.context.log("No changes found in this iteration");
        await this.devOpsClient.postCommentThread(
          repositoryId,
          pullRequestId,
          "✅ No changes to review in this iteration."
        );
        return;
      }

      this.context.log(`Found ${changes.changes.length} changed files`);

      // Filter out excluded files
      const filesToReview = changes.changes.filter((change) => {
        const path = change.item.path;
        return !this.isFileExcluded(path);
      });

      this.context.log(
        `Reviewing ${filesToReview.length} files (${changes.changes.length - filesToReview.length} excluded)`
      );

      if (filesToReview.length === 0) {
        await this.devOpsClient.postCommentThread(
          repositoryId,
          pullRequestId,
          "ℹ️ All changed files are excluded from review based on configuration."
        );
        return;
      }

      // Review each file
      const fileReviews: CodeReviewResult[] = [];

      for (const change of filesToReview) {
        try {
          this.context.log(`Reviewing file: ${change.item.path}`);

          // Get the diff for this file
          const diff = await this.devOpsClient.getFileDiff(
            repositoryId,
            pullRequestId,
            change.item.path
          );

          // Analyze the code with OpenAI
          const review = await this.openAIClient.analyzeCode(
            change.item.path,
            diff,
            change.changeType
          );

          fileReviews.push(review);

          // Post comments for this file
          await this.postReviewComments(
            repositoryId,
            pullRequestId,
            review
          );
        } catch (error: any) {
          this.context.error(
            `Error reviewing file ${change.item.path}:`,
            error
          );
          // Continue with other files
        }
      }

      // Post overall summary
      if (fileReviews.length > 0) {
        const summary = await this.openAIClient.generatePRSummary(fileReviews);
        await this.devOpsClient.postCommentThread(
          repositoryId,
          pullRequestId,
          `## 🤖 AI Code Review Summary\n\n${summary}`
        );
      }

      this.context.log("Review completed successfully");
    } catch (error: any) {
      this.context.error("Error during PR review:", error);
      throw error;
    }
  }

  /**
   * Check if a file should be excluded from review
   */
  private isFileExcluded(filePath: string): boolean {
    const excludedPatterns = config.review.excludedFiles || [];

    for (const pattern of excludedPatterns) {
      if (minimatch(filePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Post review comments to the pull request
   */
  private async postReviewComments(
    repositoryId: string,
    pullRequestId: number,
    review: CodeReviewResult
  ): Promise<void> {
    for (const comment of review.comments) {
      try {
        const severityIcon =
          comment.severity === "critical"
            ? "🚨"
            : comment.severity === "warning"
            ? "⚠️"
            : "ℹ️";

        const formattedComment = `${severityIcon} **${comment.severity.toUpperCase()}**: ${comment.comment}`;

        await this.devOpsClient.postCommentThread(
          repositoryId,
          pullRequestId,
          formattedComment,
          comment.filePath,
          comment.lineNumber
        );
      } catch (error: any) {
        this.context.error("Error posting comment:", error);
        // Continue with other comments
      }
    }
  }
}
