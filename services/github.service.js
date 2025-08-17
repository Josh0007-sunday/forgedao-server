const axios = require('axios');

exports.extractRepoInfo = (repositoryLink) => {
  try {
    
    // Handle different GitHub URL formats
    let cleanUrl = repositoryLink;
    
    // Remove .git suffix if present
    if (cleanUrl.endsWith('.git')) {
      cleanUrl = cleanUrl.slice(0, -4);
    }
    
    // Extract owner and repo from URL
    const urlPattern = /github\.com\/([^\/]+)\/([^\/]+)/;
    const match = cleanUrl.match(urlPattern);
    
    if (!match) {
      throw new Error('Invalid GitHub repository URL format');
    }
    
    const owner = match[1];
    const repo = match[2];
    
    return { owner, repo };
  } catch (error) {
    console.error('Error extracting repo info:', error);
    throw error;
  }
};

// Fork repository for collaboration
exports.forkRepository = async (owner, repo, accessToken) => {
  try {
    
    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/forks`,
      {},
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    if (error.response?.status === 422) {
      // Fork already exists, get the existing fork
      console.log('Fork already exists, fetching existing fork...');
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      
      const username = userResponse.data.login;
      
      const forkResponse = await axios.get(
        `https://api.github.com/repos/${username}/${repo}`,
        {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );
      
      return forkResponse.data;
    }
    
    console.error('Fork creation error:', error.response?.data || error.message);
    throw new Error(`Failed to fork repository: ${error.response?.data?.message || error.message}`);
  }
};

exports.createBranchInFork = async (originalOwner, originalRepo, branchName, accessToken) => {
  try {
    console.log('Creating branch in fork with params:', { originalOwner, originalRepo, branchName });
    
    // Get current user to determine fork location
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    
    const username = userResponse.data.login;
    console.log('Current user:', username);
    
    // Fork the repository (or get existing fork)
    const fork = await this.forkRepository(originalOwner, originalRepo, accessToken);
    
    // Wait a moment for the fork to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get the default branch of the original repository
    const originalRepoInfo = await axios.get(
      `https://api.github.com/repos/${originalOwner}/${originalRepo}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    const defaultBranch = originalRepoInfo.data.default_branch;
    
    // Get the SHA of the default branch from the fork
    const branchInfo = await axios.get(
      `https://api.github.com/repos/${username}/${originalRepo}/git/ref/heads/${defaultBranch}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    const sha = branchInfo.data.object.sha;
    console.log('Got SHA from fork:', sha);
    
    // Check if branch already exists in fork
    try {
      await axios.get(
        `https://api.github.com/repos/${username}/${originalRepo}/git/ref/heads/${branchName}`,
        {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );
      
      throw new Error(`Branch '${branchName}' already exists in your fork`);
    } catch (error) {
      if (error.response?.status !== 404) {
        throw error;
      }
    }
    
    // Create new branch in the fork
    console.log('Creating branch in fork...');
    const response = await axios.post(
      `https://api.github.com/repos/${username}/${originalRepo}/git/refs`,
      {
        ref: `refs/heads/${branchName}`,
        sha: sha
      },
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    console.log('Branch created in fork:', response.data);
    
    return {
      ...response.data,
      forkOwner: username,
      originalOwner,
      originalRepo,
      cloneUrl: `https://github.com/${username}/${originalRepo}.git`,
      forkUrl: `https://github.com/${username}/${originalRepo}`,
      branchUrl: `https://github.com/${username}/${originalRepo}/tree/${branchName}`,
      workingInstructions: `
To work on this branch:
1. Clone your fork: git clone https://github.com/${username}/${originalRepo}.git
2. Navigate to directory: cd ${originalRepo}
3. Checkout the branch: git checkout ${branchName}
4. Make your changes and commit them
5. Push to your fork: git push origin ${branchName}
6. Create a pull request from your fork's branch to ${originalOwner}:${defaultBranch}
      `
    };
  } catch (error) {
    console.error('GitHub API Error Details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method
    });
    
    if (error.response?.status === 404) {
      throw new Error(`Repository or fork not found. Please ensure you have access to fork '${originalOwner}/${originalRepo}'.`);
    } else if (error.response?.status === 401) {
      throw new Error('GitHub authentication failed. Please check your access token.');
    } else if (error.response?.status === 403) {
      throw new Error('Permission denied. Your GitHub token may not have the required scopes.');
    } else if (error.message.includes('already exists')) {
      throw error;
    } else {
      throw new Error(`Failed to create branch in fork: ${error.response?.data?.message || error.message}`);
    }
  }
};

// Check if there are commits between two branches
exports.compareBranches = async (owner, repo, base, head, accessToken) => {
  try {
    console.log(`Comparing branches: ${base}...${head} in ${owner}/${repo}`);
    
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    console.log('Branch comparison result:', {
      ahead_by: response.data.ahead_by,
      behind_by: response.data.behind_by,
      total_commits: response.data.total_commits,
      status: response.data.status
    });
    
    return {
      ahead_by: response.data.ahead_by,
      behind_by: response.data.behind_by,
      total_commits: response.data.total_commits,
      commits: response.data.commits,
      status: response.data.status,
      hasChanges: response.data.total_commits > 0 || response.data.ahead_by > 0
    };
  } catch (error) {
    console.error('Branch comparison error:', error.response?.data || error.message);
    
    // If comparison fails, let's try to check if the branch exists and has any commits
    if (error.response?.status === 404) {
      throw new Error(`Branch comparison failed: Branch '${head}' may not exist or may not have been pushed to the fork yet.`);
    }
    
    throw new Error(`Failed to compare branches: ${error.response?.data?.message || error.message}`);
  }
};

exports.createPullRequestFromFork = async (originalOwner, originalRepo, forkOwner, branchName, title, description, accessToken) => {
  try {
    console.log('Creating PR from fork:', { originalOwner, originalRepo, forkOwner, branchName, title });
    
    // First, check if there are any changes between the branches
    const comparison = await this.compareBranches(
      originalOwner, 
      originalRepo, 
      'main', 
      `${forkOwner}:${branchName}`, 
      accessToken
    );
    
    if (!comparison.hasChanges) {
      throw new Error(`Cannot create pull request: No changes detected between the original repository and your branch.

This happens because:
• You haven't made any commits to your branch yet
• Your branch is identical to the original repository

To fix this:
1. Clone your fork: git clone https://github.com/${forkOwner}/${originalRepo}.git
2. Switch to your branch: git checkout ${branchName}
3. Make some changes to the code
4. Commit your changes: git add . && git commit -m "Your changes"
5. Push to your fork: git push origin ${branchName}
6. Then create the pull request

Your branch URL: https://github.com/${forkOwner}/${originalRepo}/tree/${branchName}`);
    }
    
    console.log(`Found ${comparison.total_commits} commits to include in PR`);
    
    const response = await axios.post(
      `https://api.github.com/repos/${originalOwner}/${originalRepo}/pulls`,
      {
        title: title,
        head: `${forkOwner}:${branchName}`, // This is key - fork:branch format
        base: 'main', // or whatever the default branch is
        body: description,
        maintainer_can_modify: true
      },
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    console.log('PR created successfully from fork:', {
      number: response.data.number,
      url: response.data.html_url
    });
    
    return response.data;
  } catch (error) {
    console.error('GitHub PR Creation Error:', error.response?.data || error.message);
    
    if (error.response?.status === 422) {
      const errorMessage = error.response.data.message;
      if (errorMessage.includes('No commits between')) {
        throw new Error(`Cannot create pull request: No changes detected between the original repository and your branch.

This means you haven't made any commits to your branch yet. To create a pull request:

1. Clone your fork: git clone https://github.com/${forkOwner}/${originalRepo}.git
2. Navigate to the directory: cd ${originalRepo}
3. Switch to your branch: git checkout ${branchName}
4. Make your changes to the code
5. Stage changes: git add .
6. Commit changes: git commit -m "Describe your changes"
7. Push to your fork: git push origin ${branchName}
8. Then try creating the pull request again

Your fork: https://github.com/${forkOwner}/${originalRepo}
Your branch: https://github.com/${forkOwner}/${originalRepo}/tree/${branchName}`);
      } else {
        throw new Error(`Cannot create pull request: ${errorMessage}`);
      }
    }
    
    throw new Error(`Failed to create pull request from fork: ${error.response?.data?.message || error.message}`);
  }
};

// Keep the original methods for backward compatibility
exports.createBranch = exports.createBranchInFork;
exports.createPullRequest = exports.createPullRequestFromFork;

exports.getOpenPullRequests = async (owner, repo, accessToken) => {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=open`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    return response.data.map(pr => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      head: pr.head.ref,
      base: pr.base.ref,
      user: {
        login: pr.user.login,
        avatar_url: pr.user.avatar_url
      },
      html_url: pr.html_url,
      created_at: pr.created_at,
      updated_at: pr.updated_at
    }));
  } catch (error) {
    console.error('GitHub Get PRs Error:', error.response?.data || error.message);
    throw new Error(`Failed to get pull requests: ${error.response?.data?.message || error.message}`);
  }
};

exports.mergePullRequest = async (owner, repo, pullNumber, mergeMethod, accessToken) => {
  try {
    const response = await axios.put(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      {
        merge_method: mergeMethod
      },
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('GitHub Merge Error:', error.response?.data || error.message);
    throw new Error(`Failed to merge pull request: ${error.response?.data?.message || error.message}`);
  }
};

exports.getRepositoryInfo = async (owner, repo, accessToken) => {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    
    return {
      name: response.data.name,
      full_name: response.data.full_name,
      description: response.data.description,
      default_branch: response.data.default_branch,
      html_url: response.data.html_url
    };
  } catch (error) {
    console.error('GitHub Repo Info Error:', error.response?.data || error.message);
    throw new Error(`Failed to get repository info: ${error.response?.data?.message || error.message}`);
  }
};

exports.validateGitHubToken = async (accessToken) => {
  try {
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    
    console.log('GitHub token is valid for user:', response.data.login);
    
    const scopes = response.headers['x-oauth-scopes']?.split(', ') || [];
    console.log('Token scopes:', scopes);
    
    return {
      valid: true,
      user: response.data.login,
      scopes: scopes
    };
  } catch (error) {
    console.error('GitHub token validation failed:', error.response?.data);
    return {
      valid: false,
      error: error.response?.data?.message || error.message
    };
  }
};

// Get repository statistics (contributors, commits, etc.)
exports.getRepositoryStats = async (owner, repo, accessToken) => {
  try {
    const [repoInfo, contributors, commits] = await Promise.all([
      axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }),
      axios.get(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }),
      axios.get(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      })
    ]);

    return {
      stars: repoInfo.data.stargazers_count,
      forks: repoInfo.data.forks_count,
      watchers: repoInfo.data.watchers_count,
      openIssues: repoInfo.data.open_issues_count,
      size: repoInfo.data.size,
      language: repoInfo.data.language,
      defaultBranch: repoInfo.data.default_branch,
      contributors: contributors.data.length,
      recentCommits: commits.data.length,
      lastUpdated: repoInfo.data.updated_at
    };
  } catch (error) {
    console.error('GitHub Stats Error:', error.response?.data || error.message);
    throw new Error(`Failed to get repository stats: ${error.response?.data?.message || error.message}`);
  }
};

// Get recent commits with detailed information
exports.getRecentCommits = async (owner, repo, accessToken, limit = 10) => {
  try {
    console.log(`Fetching ${limit} commits for ${owner}/${repo}`);
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${limit}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    return response.data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        date: commit.commit.author.date,
        login: commit.author?.login,
        avatar_url: commit.author?.avatar_url
      },
      stats: commit.stats || { total: 0, additions: 0, deletions: 0 },
      files: commit.files || [],
      html_url: commit.html_url
    }));
  } catch (error) {
    console.error('GitHub Commits Error:', error.response?.data || error.message);
    throw new Error(`Failed to get recent commits: ${error.response?.data?.message || error.message}`);
  }
};

// Get file changes for a specific commit or between commits
exports.getFileChanges = async (owner, repo, sha, accessToken) => {
  try {
    console.log(`Fetching file changes for commit ${sha} in ${owner}/${repo}`);
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    const commit = response.data;
    
    return {
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author,
      stats: {
        total: commit.stats?.total || 0,
        additions: commit.stats?.additions || 0,
        deletions: commit.stats?.deletions || 0
      },
      files: (commit.files || []).map(file => ({
        filename: file.filename,
        status: file.status, // "added", "modified", "removed"
        additions: file.additions || 0,
        deletions: file.deletions || 0,
        changes: file.changes || 0,
        patch: file.patch
      }))
    };
  } catch (error) {
    console.error('GitHub File Changes Error:', error.response?.data || error.message);
    throw new Error(`Failed to get file changes: ${error.response?.data?.message || error.message}`);
  }
};

// Get repository comparison between two commits/branches
exports.getRepositoryComparison = async (owner, repo, base, head, accessToken) => {
  try {
    console.log(`Comparing ${base}...${head} in ${owner}/${repo}`);
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    const comparison = response.data;
    
    return {
      status: comparison.status,
      ahead_by: comparison.ahead_by,
      behind_by: comparison.behind_by,
      total_commits: comparison.total_commits,
      commits: comparison.commits,
      files: (comparison.files || []).map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions || 0,
        deletions: file.deletions || 0,
        changes: file.changes || 0,
        patch: file.patch
      })),
      stats: {
        total: comparison.files?.reduce((sum, file) => sum + (file.changes || 0), 0) || 0,
        additions: comparison.files?.reduce((sum, file) => sum + (file.additions || 0), 0) || 0,
        deletions: comparison.files?.reduce((sum, file) => sum + (file.deletions || 0), 0) || 0
      }
    };
  } catch (error) {
    console.error('GitHub Comparison Error:', error.response?.data || error.message);
    throw new Error(`Failed to compare repositories: ${error.response?.data?.message || error.message}`);
  }
};

// Get repository contents (files and directories)
exports.getRepositoryContents = async (owner, repo, path = '', accessToken) => {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    return response.data.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type, // "file" or "dir"
      size: item.size,
      sha: item.sha,
      download_url: item.download_url,
      html_url: item.html_url
    }));
  } catch (error) {
    console.error('GitHub Contents Error:', error.response?.data || error.message);
    throw new Error(`Failed to get repository contents: ${error.response?.data?.message || error.message}`);
  }
};

// Get CI/CD status checks for a commit or branch
exports.getStatusChecks = async (owner, repo, ref, accessToken) => {
  try {
    const [statusResponse, checksResponse] = await Promise.all([
      // Get status API results (older format)
      axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${ref}/status`, {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }).catch(() => ({ data: { state: 'pending', statuses: [] } })),
      
      // Get check runs (newer format)
      axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${ref}/check-runs`, {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github+json'
        }
      }).catch(() => ({ data: { check_runs: [] } }))
    ]);

    const statuses = statusResponse.data.statuses || [];
    const checkRuns = checksResponse.data.check_runs || [];

    // Combine both status API and checks API results
    const allChecks = [
      ...statuses.map(status => ({
        name: status.context,
        status: status.state, // success, failure, pending, error
        conclusion: status.state,
        details_url: status.target_url,
        description: status.description
      })),
      ...checkRuns.map(check => ({
        name: check.name,
        status: check.status, // completed, in_progress, queued
        conclusion: check.conclusion, // success, failure, neutral, cancelled, skipped, timed_out
        details_url: check.details_url,
        description: check.output?.summary || check.output?.title
      }))
    ];

    return {
      overall_state: statusResponse.data.state,
      checks: allChecks
    };
  } catch (error) {
    console.error('GitHub Status Checks Error:', error.response?.data || error.message);
    // Return empty checks if we can't fetch them (common for repos without CI)
    return {
      overall_state: 'pending',
      checks: []
    };
  }
};

// Get branches with commit information
exports.getBranches = async (owner, repo, accessToken) => {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    return response.data.map(branch => ({
      name: branch.name,
      commit: {
        sha: branch.commit.sha,
        url: branch.commit.url
      },
      protected: branch.protected
    }));
  } catch (error) {
    console.error('GitHub Branches Error:', error.response?.data || error.message);
    throw new Error(`Failed to get branches: ${error.response?.data?.message || error.message}`);
  }
};