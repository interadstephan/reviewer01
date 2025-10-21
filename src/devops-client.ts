import axios, { AxiosInstance } from "axios";

export interface PRChange {
  item: {
    path: string;
  };
  changeType: string;
}

export interface PRIteration {
  id: number;
  description?: string;
}

export interface PRChangeDetail {
  changes: PRChange[];
}

export interface CommentThread {
  comments: Array<{
    content: string;
  }>;
  threadContext?: {
    filePath: string;
    rightFileStart?: {
      line: number;
      offset: number;
    };
    rightFileEnd?: {
      line: number;
      offset: number;
    };
  };
  status: number;
}

export class DevOpsClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(
    private organization: string,
    private project: string,
    private personalAccessToken: string
  ) {
    this.baseUrl = `https://dev.azure.com/${organization}/${project}/_apis`;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`:${personalAccessToken}`).toString(
          "base64"
        )}`,
      },
    });
  }

  /**
   * Get all iterations for a pull request
   */
  async getPullRequestIterations(
    repositoryId: string,
    pullRequestId: number
  ): Promise<PRIteration[]> {
    try {
      const response = await this.client.get(
        `/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/iterations`,
        {
          params: {
            "api-version": "7.0",
          },
        }
      );
      return response.data.value || [];
    } catch (error: any) {
      throw new Error(
        `Failed to get PR iterations: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get changes for a specific iteration
   */
  async getIterationChanges(
    repositoryId: string,
    pullRequestId: number,
    iterationId: number
  ): Promise<PRChangeDetail> {
    try {
      const response = await this.client.get(
        `/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/iterations/${iterationId}/changes`,
        {
          params: {
            "api-version": "7.0",
          },
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(
        `Failed to get iteration changes: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get diff for a specific file
   */
  async getFileDiff(
    repositoryId: string,
    pullRequestId: number,
    path: string
  ): Promise<string> {
    try {
      // Get PR details to find source and target commits
      const prResponse = await this.client.get(
        `/git/repositories/${repositoryId}/pullRequests/${pullRequestId}`,
        {
          params: {
            "api-version": "7.0",
          },
        }
      );

      const pr = prResponse.data;
      const baseVersionDescriptor = {
        versionType: "commit",
        version: pr.lastMergeTargetCommit.commitId,
      };
      const targetVersionDescriptor = {
        versionType: "commit",
        version: pr.lastMergeSourceCommit.commitId,
      };

      // Get the diff
      const diffResponse = await this.client.get(
        `/git/repositories/${repositoryId}/diffs/commits`,
        {
          params: {
            "api-version": "7.0",
            baseVersionType: baseVersionDescriptor.versionType,
            baseVersion: baseVersionDescriptor.version,
            targetVersionType: targetVersionDescriptor.versionType,
            targetVersion: targetVersionDescriptor.version,
            path: path,
          },
        }
      );

      // Format the diff into a readable string
      return this.formatDiff(diffResponse.data);
    } catch (error: any) {
      throw new Error(
        `Failed to get file diff: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Format diff data into a readable string
   */
  private formatDiff(diffData: any): string {
    if (!diffData || !diffData.changes || diffData.changes.length === 0) {
      return "No changes found";
    }

    let result = "";
    for (const change of diffData.changes) {
      if (change.item && change.item.path) {
        result += `\n--- ${change.item.path}\n`;
      }

      if (change.changeType) {
        result += `Change Type: ${change.changeType}\n`;
      }

      // If there are blocks of changes, format them
      if (change.blocks) {
        for (const block of change.blocks) {
          if (block.changeType === "delete") {
            result += `- ${block.oLine}: ${block.oContent || ""}\n`;
          } else if (block.changeType === "add") {
            result += `+ ${block.mLine}: ${block.mContent || ""}\n`;
          }
        }
      }
    }

    return result;
  }

  /**
   * Post a review comment thread on a pull request
   */
  async postCommentThread(
    repositoryId: string,
    pullRequestId: number,
    comment: string,
    filePath?: string,
    lineNumber?: number
  ): Promise<void> {
    try {
      const thread: CommentThread = {
        comments: [
          {
            content: comment,
          },
        ],
        status: 1, // Active
      };

      // Add file context if provided
      if (filePath && lineNumber) {
        thread.threadContext = {
          filePath: filePath,
          rightFileStart: {
            line: lineNumber,
            offset: 1,
          },
          rightFileEnd: {
            line: lineNumber,
            offset: 1,
          },
        };
      }

      await this.client.post(
        `/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads`,
        thread,
        {
          params: {
            "api-version": "7.0",
          },
        }
      );
    } catch (error: any) {
      throw new Error(
        `Failed to post comment thread: ${error.response?.data?.message || error.message}`
      );
    }
  }
}
