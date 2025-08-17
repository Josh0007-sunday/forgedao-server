const Proposal = require('../models/Proposal');

exports.validateProposalOwner = async (proposalId, userId) => {
  const proposal = await Proposal.findById(proposalId).populate('createdBy');
  
  if (!proposal) {
    throw new Error('Proposal not found');
  }
  
  if (proposal.createdBy._id.toString() !== userId.toString()) {
    throw new Error('Not authorized');
  }
  
  return proposal;
};