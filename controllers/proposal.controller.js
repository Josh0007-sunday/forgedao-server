const Proposal = require('../models/Proposal');
const User = require('../models/User');
const githubService = require('../services/github.service');
const proposalService = require('../services/proposal.service');
const axios = require('axios');

exports.createProposal = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const { title, description, repositoryLink, githubIssueLink } = req.body;
    
    const proposal = new Proposal({
      title,
      description,
      repositoryLink,
      githubIssueLink,
      createdBy: req.user.id
    });
    
    const savedProposal = await proposal.save();
    
    res.status(201).json(savedProposal);
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ message: 'Error creating proposal', error: error.message });
  }
};

exports.getProposals = async (req, res) => {
  try {
    const proposals = await Proposal.find();
    res.json(proposals);
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ message: 'Error fetching proposals' });
  }
};

exports.getProposal = async (req, res) => {
    try {
        const proposal = await Proposal.findById(req.params.id);
        if (!proposal) {
            return res.status(404).json({ message: 'Proposal not found' });
        }
        res.json(proposal);
    } catch (error) {
        console.error('Error fetching proposal:', error);
        res.status(500).json({ message: 'Error fetching proposal' });
    }
};

exports.getUserProposals = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { getDB } = require('../config/db');
    const sql = getDB();
    
    const result = await sql`
      SELECT 
        p.*,
        u.id as creator_id,
        u.username as creator_username,
        u.wallet_address as creator_wallet_address
      FROM proposals p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.created_by = ${userId}
      ORDER BY p.created_at DESC
    `;

    const proposals = result.map(row => {
      const proposal = new Proposal(row);
      // Handle the case where created_by might be null
      if (row.creator_id) {
        proposal.createdBy = {
          _id: row.creator_id,
          id: row.creator_id,
          username: row.creator_username || 'Unknown User',
          walletAddress: row.creator_wallet_address
        };
      } else {
        proposal.createdBy = {
          _id: null,
          id: null,
          username: 'Unknown User',
          walletAddress: null
        };
      }
      return proposal;
    });
    
    res.json(proposals);
  } catch (error) {
    console.error('Error fetching user proposals:', error);
    res.status(500).json({ message: 'Error fetching user proposals' });
  }
};

// UPDATED: Create branch for collaboration using fork-based workflow
exports.createCollaborationBranch = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const proposal = await Proposal.findById(req.params.id);
    
    if (!proposal) {
      return res.status(404).json({ message: 'Proposal not found' });
    }
    
    // Check if user is NOT the owner (only non-owners can create branches)
    if (proposal.createdBy.id == req.user.id) {
      return res.status(403).json({ 
        message: 'Proposal owners cannot create branches. Only collaborators can contribute.' 
      });
    }
    
    const { owner, repo } = githubService.extractRepoInfo(proposal.repositoryLink);
    
    // Create branch with format: username-userId-timestamp
    const branchName = `${req.user.username}-${req.user.id}-${Date.now()}`;
    
    // Use fork-based workflow
    const branch = await githubService.createBranchInFork(
      owner, 
      repo, 
      branchName, 
      req.user.accessToken
    );
    
    // Log the branch creation in database
    await logBranchActivity(proposal.id, req.user.id, branchName, 'created');
    
    res.json({ 
      message: 'Collaboration branch created successfully in your fork',
      branchName,
      branch,
      forkOwner: branch.forkOwner,
      originalRepo: `${owner}/${repo}`,
      cloneUrl: branch.cloneUrl,
      instructions: branch.workingInstructions,
      message_detail: `Branch created in your fork: ${branch.forkOwner}/${repo}:${branchName}`,
      success: true
    });
  } catch (error) {
    console.error('Error creating collaboration branch:', error);
    res.status(500).json({ 
      message: 'Error creating collaboration branch',
      error: error.message,
      success: false
    });
  }
};

// UPDATED: Create pull request using fork-based workflow
exports.createPullRequest = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const proposal = await Proposal.findById(req.params.id);
    
    if (!proposal) {
      return res.status(404).json({ message: 'Proposal not found' });
    }
    
    // Check if user is NOT the owner
    if (proposal.createdBy.id == req.user.id) {
      return res.status(403).json({ 
        message: 'Proposal owners cannot create pull requests. Only collaborators can contribute.' 
      });
    }
    
    const { branchName, title, description } = req.body;
    
    if (!branchName || !title) {
      return res.status(400).json({ message: 'Branch name and title are required' });
    }
    
    const { owner, repo } = githubService.extractRepoInfo(proposal.repositoryLink);
    
    // Get current user for fork-based PR
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${req.user.accessToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    
    const forkOwner = userResponse.data.login;
    
    const pullRequest = await githubService.createPullRequestFromFork(
      owner,
      repo,
      forkOwner,
      branchName,
      title,
      description || `Pull request from ${req.user.username} for proposal: ${proposal.title}`,
      req.user.accessToken
    );
    
    // Log the PR creation
    await logPullRequestActivity(proposal.id, req.user.id, pullRequest.number, branchName, 'created');
    
    res.json({ 
      message: 'Pull request created successfully from your fork',
      pullRequest: {
        number: pullRequest.number,
        url: pullRequest.html_url,
        title: pullRequest.title,
        head: `${forkOwner}:${branchName}`,
        base: `${owner}:main`
      },
      success: true
    });
  } catch (error) {
    console.error('Error creating pull request:', error);
    res.status(500).json({ 
      message: 'Error creating pull request',
      error: error.message,
      success: false
    });
  }
};

// Get proposal activity (for proposal owners to see PRs and branches)
exports.getProposalActivity = async (req, res) => {
  try {
    const proposalId = req.params.id;
    const { getDB } = require('../config/db');
    const sql = getDB();
    
    // Get branches created for this proposal
    const branches = await sql`
      SELECT 
        ba.*,
        u.username,
        u.id as user_id
      FROM branch_activities ba
      JOIN users u ON ba.user_id = u.id
      WHERE ba.proposal_id = ${proposalId}
      ORDER BY ba.created_at DESC
    `;
    
    // Get pull requests for this proposal
    const pullRequests = await sql`
      SELECT 
        pra.*,
        u.username,
        u.id as user_id
      FROM pull_request_activities pra
      JOIN users u ON pra.user_id = u.id
      WHERE pra.proposal_id = ${proposalId}
      ORDER BY pra.created_at DESC
    `;
    
    res.json({
      branches: branches,
      pullRequests: pullRequests
    });
  } catch (error) {
    console.error('Error fetching proposal activity:', error);
    res.status(500).json({ message: 'Error fetching proposal activity' });
  }
};

// Get open pull requests for a proposal (for owners to review)
exports.getOpenPullRequests = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const proposal = await Proposal.findById(req.params.id);
    
    if (!proposal) {
      return res.status(404).json({ message: 'Proposal not found' });
    }
    
    // Only proposal owner can view pull requests for management
    if (proposal.createdBy.id != req.user.id) {
      return res.status(403).json({ 
        message: 'Only proposal owners can view pull requests for management' 
      });
    }
    
    const { owner, repo } = githubService.extractRepoInfo(proposal.repositoryLink);
    
    const pullRequests = await githubService.getOpenPullRequests(
      owner,
      repo,
      req.user.accessToken
    );
    
    res.json(pullRequests);
  } catch (error) {
    console.error('Error fetching open pull requests:', error);
    res.status(500).json({ 
      message: 'Error fetching open pull requests',
      error: error.message 
    });
  }
};

// Merge pull request (only proposal owners)
exports.mergePullRequest = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const proposal = await Proposal.findById(req.params.id);
    
    if (!proposal) {
      return res.status(404).json({ message: 'Proposal not found' });
    }
    
    // Only proposal owner can merge PRs
    if (proposal.createdBy.id != req.user.id) {
      return res.status(403).json({ 
        message: 'Only proposal owners can merge pull requests' 
      });
    }
    
    const { pullRequestNumber, mergeMethod = 'merge' } = req.body;
    
    if (!pullRequestNumber) {
      return res.status(400).json({ message: 'Pull request number is required' });
    }
    
    const { owner, repo } = githubService.extractRepoInfo(proposal.repositoryLink);
    
    const mergeResult = await githubService.mergePullRequest(
      owner,
      repo,
      pullRequestNumber,
      mergeMethod,
      req.user.accessToken
    );
    
    // Log the merge
    await logPullRequestActivity(proposal.id, req.user.id, pullRequestNumber, null, 'merged');
    
    res.json({ 
      message: 'Pull request merged successfully',
      mergeResult
    });
  } catch (error) {
    console.error('Error merging pull request:', error);
    res.status(500).json({ 
      message: 'Error merging pull request',
      error: error.message 
    });
  }
};

// Debug GitHub access
exports.debugGitHubAccess = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const proposal = await Proposal.findById(req.params.id);
    
    if (!proposal) {
      return res.status(404).json({ message: 'Proposal not found' });
    }
    
    console.log('Debug info:');
    console.log('- Proposal:', proposal.title);
    console.log('- Repository Link:', proposal.repositoryLink);
    console.log('- User:', req.user.username);
    console.log('- Access Token (first 10 chars):', req.user.accessToken?.substring(0, 10) + '...');
    
    const { owner, repo } = githubService.extractRepoInfo(proposal.repositoryLink);
    
    // Validate GitHub token
    const tokenValidation = await githubService.validateGitHubToken(req.user.accessToken);
    
    // Try to access the repository
    let repoAccess = null;
    try {
      repoAccess = await githubService.getRepositoryInfo(owner, repo, req.user.accessToken);
    } catch (error) {
      repoAccess = { error: error.message };
    }
    
    res.json({
      proposal: {
        id: proposal.id,
        title: proposal.title,
        repositoryLink: proposal.repositoryLink
      },
      extractedRepoInfo: { owner, repo },
      user: {
        id: req.user.id,
        username: req.user.username,
        hasAccessToken: !!req.user.accessToken
      },
      githubToken: tokenValidation,
      repositoryAccess: repoAccess
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ 
      message: 'Debug error',
      error: error.message 
    });
  }
};

// Helper function to log branch activities
async function logBranchActivity(proposalId, userId, branchName, action) {
  try {
    const { getDB } = require('../config/db');
    const sql = getDB();
    
    await sql`
      INSERT INTO branch_activities (proposal_id, user_id, branch_name, action)
      VALUES (${proposalId}, ${userId}, ${branchName}, ${action})
    `;
  } catch (error) {
    console.error('Error logging branch activity:', error);
  }
}

// Debug endpoint to check user data
exports.debugUserData = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { getDB } = require('../config/db');
    const sql = getDB();
    
    const users = await sql`SELECT id, username, github_id, access_token FROM users WHERE id = ${userId}`;
    
    res.json({
      userId: userId,
      user: users[0] || null,
      hasAccessToken: users[0] ? !!users[0].access_token : false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getGitHubData = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const proposalId = req.params.id;
    const proposal = await Proposal.findById(proposalId);

    if (!proposal) {
      return res.status(404).json({ message: 'Proposal not found' });
    }

    const { owner, repo } = githubService.extractRepoInfo(proposal.repositoryLink);
    
    // Use the proposal creator's access token for API calls
    const creatorId = proposal.createdBy.id || proposal.createdBy._id || proposal.createdBy;
    const proposalCreator = await User.findById(creatorId);
    
    if (!proposalCreator) {
      return res.status(404).json({ 
        message: `Proposal creator not found in database (ID: ${creatorId})` 
      });
    }
    
    if (!proposalCreator.accessToken) {
      return res.status(403).json({ 
        message: `Unable to access GitHub data: Proposal creator '${proposalCreator.username}' has not connected their GitHub account. They need to log in via GitHub OAuth to enable GitHub integration.` 
      });
    }

    const accessToken = proposalCreator.accessToken;

    try {
      // Test basic repository access first
      try {
        const basicRepoInfo = await githubService.getRepositoryInfo(owner, repo, accessToken);
      } catch (error) {
        console.error('Basic repo access failed:', error.message);
        console.error('Full error:', error);
        return res.status(502).json({ 
          message: 'Failed to access GitHub repository', 
          error: `Cannot access repository ${owner}/${repo}. ${error.message}`,
          details: {
            owner,
            repo,
            repositoryLink: proposal.repositoryLink
          }
        });
      }
      
      // Fetch GitHub data step by step with error handling
      let repoStats, recentCommits, branches, statusChecks, repoContents;
      
      try {
        repoStats = await githubService.getRepositoryStats(owner, repo, accessToken);
      } catch (error) {
        console.error('Error fetching repo stats:', error.message);
        repoStats = {
          stars: 0, forks: 0, watchers: 0, openIssues: 0, size: 0,
          language: 'Unknown', defaultBranch: 'main', contributors: 0,
          recentCommits: 0, lastUpdated: new Date().toISOString()
        };
      }
      
      try {
        recentCommits = await githubService.getRecentCommits(owner, repo, accessToken, 5);
      } catch (error) {
        console.error('Error fetching recent commits:', error.message);
        recentCommits = [];
      }
      
      try {
        branches = await githubService.getBranches(owner, repo, accessToken);
      } catch (error) {
        console.error('Error fetching branches:', error.message);
        branches = [];
      }
      
      try {
        const repoInfo = await githubService.getRepositoryInfo(owner, repo, accessToken);
        statusChecks = await githubService.getStatusChecks(owner, repo, repoInfo.default_branch, accessToken);
        console.log('Status checks fetched:', statusChecks.checks.length);
      } catch (error) {
        console.error('Error fetching status checks:', error.message);
        statusChecks = { overall_state: 'pending', checks: [] };
      }
      
      try {
        repoContents = await githubService.getRepositoryContents(owner, repo, '', accessToken);
        console.log('Repository contents fetched:', repoContents.length);
      } catch (error) {
        console.error('Error fetching repo contents:', error.message);
        repoContents = [];
      }

      // Calculate additional stats from the data we have
      let totalLinesAdded = 0;
      let totalLinesDeleted = 0;
      let totalFilesChanged = 0;

      // Get file changes for the most recent commit if available
      let fileChanges = [];
      if (recentCommits.length > 0) {
        try {
          console.log('Fetching file changes for commit:', recentCommits[0].sha);
          const latestCommitChanges = await githubService.getFileChanges(owner, repo, recentCommits[0].sha, accessToken);
          fileChanges = latestCommitChanges.files;
          totalLinesAdded = latestCommitChanges.stats.additions;
          totalLinesDeleted = latestCommitChanges.stats.deletions;
          totalFilesChanged = latestCommitChanges.files.length;
          console.log('File changes fetched:', fileChanges.length, 'files');
        } catch (error) {
          console.error('Could not fetch file changes for latest commit:', error.message);
        }
      }

      // Skip build checks for now

      const githubData = {
        repository: {
          owner,
          repo,
          stats: repoStats
        },
        stats: {
          totalBranches: branches.length,
          totalForks: repoStats.forks,
          totalCommits: repoStats.recentCommits,
          filesChanged: totalFilesChanged,
          linesAdded: totalLinesAdded,
          linesDeleted: totalLinesDeleted
        },
        commits: recentCommits,
        fileChanges: fileChanges,
        branches: branches,
        files: repoContents.filter(item => item.type === 'file').slice(0, 10) // Limit to 10 files
      };

      res.json(githubData);
    } catch (githubError) {
      console.error('GitHub API Error:', githubError.message);
      res.status(502).json({ 
        message: 'Failed to fetch GitHub data', 
        error: githubError.message 
      });
    }
  } catch (error) {
    console.error('Error fetching GitHub data:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Internal server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

// Helper function to log pull request activities
async function logPullRequestActivity(proposalId, userId, prNumber, branchName, action) {
  try {
    const { getDB } = require('../config/db');
    const sql = getDB();
    
    await sql`
      INSERT INTO pull_request_activities (proposal_id, user_id, pr_number, branch_name, action)
      VALUES (${proposalId}, ${userId}, ${prNumber}, ${branchName}, ${action})
    `;
  } catch (error) {
    console.error('Error logging PR activity:', error);
  }
}