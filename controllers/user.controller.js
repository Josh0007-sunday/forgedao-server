const User = require('../models/User');

exports.updateWalletAddress = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ message: 'Wallet address is required' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { walletAddress },
      { new: true }
    );
    
    res.json({ walletAddress: user.walletAddress });
  } catch (error) {
    res.status(500).json({ message: 'Error updating wallet address' });
  }
};

exports.getUserById = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return public user information
    res.json({
      id: user.id,
      username: user.username,
      walletAddress: user.walletAddress,
      githubId: user.githubId,
      bio: user.bio,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
};

exports.getUserActivities = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const { id } = req.params;
    const { getDB } = require('../config/db');
    const sql = getDB();
    
    // Get user's branch activities with proposal titles
    const branches = await sql`
      SELECT 
        ba.*,
        p.title as proposal_title,
        'branch' as type
      FROM branch_activities ba
      JOIN proposals p ON ba.proposal_id = p.id
      WHERE ba.user_id = ${id}
      ORDER BY ba.created_at DESC
      LIMIT 20
    `;
    
    // Get user's pull request activities with proposal titles  
    const pullRequests = await sql`
      SELECT 
        pra.*,
        p.title as proposal_title,
        'pull_request' as type
      FROM pull_request_activities pra
      JOIN proposals p ON pra.proposal_id = p.id
      WHERE pra.user_id = ${id}
      ORDER BY pra.created_at DESC
      LIMIT 20
    `;
    
    // Combine and sort activities
    const allActivities = [...branches, ...pullRequests]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20);
    
    res.json({ activities: allActivities });
  } catch (error) {
    console.error('Error fetching user activities:', error);
    res.status(500).json({ message: 'Error fetching user activities' });
  }
};

exports.getUserStats = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  try {
    const { id } = req.params;
    const { getDB } = require('../config/db');
    const sql = getDB();
    
    // Get all pull requests made to this user's proposals
    const pullRequestsToUserProposals = await sql`
      SELECT COUNT(*) as total_pull_requests
      FROM pull_request_activities pra
      JOIN proposals p ON pra.proposal_id = p.id
      WHERE p.created_by = ${id}
    `;
    
    // Get user's own contributions (branches and PRs they made)
    const userContributions = await sql`
      SELECT 
        (SELECT COUNT(*) FROM branch_activities WHERE user_id = ${id}) as user_branches,
        (SELECT COUNT(*) FROM pull_request_activities WHERE user_id = ${id}) as user_pull_requests
    `;
    
    const totalPullRequestsToUserProposals = parseInt(pullRequestsToUserProposals[0]?.total_pull_requests) || 0;
    const userBranches = parseInt(userContributions[0]?.user_branches) || 0;
    const userPullRequests = parseInt(userContributions[0]?.user_pull_requests) || 0;
    const totalContributions = userBranches + userPullRequests;
    
    res.json({
      totalPullRequestsToProposals: totalPullRequestsToUserProposals,
      totalContributions: totalContributions,
      userBranches: userBranches,
      userPullRequests: userPullRequests
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ message: 'Error fetching user stats' });
  }
};