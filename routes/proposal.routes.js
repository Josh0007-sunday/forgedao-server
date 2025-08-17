const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposal.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Public routes
router.get('/', proposalController.getProposals);
router.get('/:id', proposalController.getProposal);
router.get('/:id/activity', proposalController.getProposalActivity);

router.get('/:id/debug', authMiddleware.isAuthenticated, proposalController.debugGitHubAccess);
router.get('/debug/user/:userId', proposalController.debugUserData);

// Protected routes
router.post('/', authMiddleware.isAuthenticated, proposalController.createProposal);
router.get('/user/:userId', proposalController.getUserProposals);

// Collaboration routes (for non-owners)
router.post('/:id/collaborate/branch', authMiddleware.isAuthenticated, proposalController.createCollaborationBranch);
router.post('/:id/collaborate/pull-request', authMiddleware.isAuthenticated, proposalController.createPullRequest);

// Management routes (for proposal owners)
router.get('/:id/pull-requests', authMiddleware.isAuthenticated, proposalController.getOpenPullRequests);
router.post('/:id/merge', authMiddleware.isAuthenticated, proposalController.mergePullRequest);

// GitHub data routes
router.get('/:id/github-data', authMiddleware.isAuthenticated, proposalController.getGitHubData);

// Legacy routes (keeping for backward compatibility)
router.post('/:id/branch', authMiddleware.isAuthenticated, proposalController.createCollaborationBranch);

module.exports = router;