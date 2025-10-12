/**
 * 🔄 REAL-TIME ORGANIZATION EVENTS UTILITIES
 * 
 * Centralized event publishing system for organization-related changes.
 * Publishes events to user-specific SSE channels when their organization data changes.
 * 
 * Channel Format: user_organizations_{email}
 * Event Types: organization_approved, organization_renewed, membership_granted, membership_revoked
 * 
 * Created: Real-time organization updates implementation
 */

const { publishToChannel } = require('../controllers/sseController');
const userModel = require('../models/userModel');

/**
 * Event type constants for organization updates
 */
const ORGANIZATION_EVENT_TYPES = {
  ORGANIZATION_APPROVED: 'organization_approved',
  ORGANIZATION_RENEWED: 'organization_renewed', 
  MEMBERSHIP_GRANTED: 'membership_granted',
  MEMBERSHIP_REVOKED: 'membership_revoked',
  ROLE_UPDATED: 'role_updated',
  PERMISSIONS_CHANGED: 'permissions_changed'
};

/**
 * Publishes organization update event to a specific user's real-time channel
 * 
 * @param {string} userEmail - Email of the user to notify
 * @param {string} eventType - Type of event (use ORGANIZATION_EVENT_TYPES constants)
 * @param {Object} eventData - Event-specific data
 * @param {string} [eventData.organizationId] - ID of the affected organization
 * @param {string} [eventData.organizationName] - Name of the affected organization
 * @param {string} [eventData.newRole] - New role (for role updates)
 * @param {Object} [eventData.metadata] - Additional event metadata
 * @returns {Promise<boolean>} Success status of the publish operation
 */
async function publishUserOrganizationEvent(userEmail, eventType, eventData = {}) {
  try {
    // Construct the user-specific channel
    const userChannel = `user_organizations_${userEmail}`;

    // Create the event payload
    const eventPayload = {
      channel: userChannel,
      type: eventType,
      timestamp: new Date().toISOString(),
      userEmail: userEmail,
      organizationId: eventData.organizationId,
      organizationName: eventData.organizationName,
      data: {
        ...eventData,
        source: 'organization_events'
      }
    };

    // Publish to the user's organization channel
    publishToChannel(userChannel, eventPayload);

    return true;

  } catch (error) {
    console.error('❌ [Org Events] Failed to publish event:', error.message);
    return false;
  }
}

/**
 * Publishes organization events to multiple users (batch operation)
 * Useful for organization-wide events that affect multiple members
 * 
 * @param {string[]} userEmails - Array of user emails to notify
 * @param {string} eventType - Type of event (use ORGANIZATION_EVENT_TYPES constants)
 * @param {Object} eventData - Event-specific data
 * @returns {Promise<Object>} Results with success/failure counts
 */
async function publishBulkUserOrganizationEvents(userEmails, eventType, eventData = {}) {
  try {
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    // Process each user in parallel for better performance
    const publishPromises = userEmails.map(async (email) => {
      try {
        const success = await publishUserOrganizationEvent(email, eventType, eventData);
        if (success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push(`Failed to notify ${email}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error notifying ${email}: ${error.message}`);
      }
    });

    await Promise.all(publishPromises);

    if (results.successful > 0 || results.failed > 0) {
      console.log(`📊 Org events: ${results.successful} sent${results.failed > 0 ? `, ${results.failed} failed` : ''}`);
    }
    return results;

  } catch (error) {
    console.error('❌ [Org Events] Bulk publish failed:', error.message);
    
    return {
      successful: 0,
      failed: userEmails.length,
      errors: [`Bulk operation failed: ${error.message}`]
    };
  }
}

/**
 * Helper function: Get updated organization data for a specific user and organization
 * Fetches fresh data from database after approval/renewal
 * 
 * @param {string} userEmail - Email of the user
 * @param {number} organizationId - ID of the organization to get data for
 * @returns {Promise<Object|null>} Fresh organization data or null if not found
 */
async function getUpdatedUserOrganizationData(userEmail, organizationId) {
  try {
    console.log('🔍 [Org Events] Getting updated organization data for user:', {
      userEmail,
      organizationId
    });

    // Fetch fresh user permissions which includes organizations array
    const userPermissions = await userModel.getPermissions(userEmail);
    console.log('🔍 [Org Events] User permissions fetched:', {
      userEmail,
      hasPermissions: !!userPermissions,
      hasOrganizations: !!userPermissions?.organizations,
      organizationCount: userPermissions?.organizations?.length || 0,
      allOrganizations: userPermissions?.organizations?.map(o => ({
        id: o.organization_id,
        name: o.name,
        position: o.position,
        cycle: o.cycle_number,
        version_id: o.current_org_version_id
      }))
    });

    const organizations = userPermissions?.organizations || [];

    // Find the specific organization
    const updatedOrgData = organizations.find(org => 
      org.organization_id === parseInt(organizationId)
    );

    return updatedOrgData || null;

  } catch (error) {
    console.error('❌ [Org Events] Failed to get updated org data:', error.message);
    return null;
  }
}

/**
 * Helper function: Get fresh user organization data and publish update
 * This function fetches the latest organization data for a user and publishes it
 * 
 * @param {string} userEmail - Email of the user
 * @param {string} reason - Reason for the refresh (for logging)
 * @returns {Promise<boolean>} Success status
 */
async function refreshUserOrganizations(userEmail, reason = 'manual_refresh') {
  try {
    // Fetch fresh organization data
    const userPermissions = await userModel.getPermissions(userEmail);
    const organizations = userPermissions?.organizations || [];

    // Publish refresh event with latest data
    const refreshEvent = {
      type: 'organizations_refreshed',
      timestamp: new Date().toISOString(),
      userEmail: userEmail,
      data: {
        organizations: organizations,
        count: organizations.length,
        reason: reason,
        source: 'organization_refresh'
      }
    };

    const userChannel = `user_organizations_${userEmail}`;
    publishToChannel(userChannel, refreshEvent);

    return true;

  } catch (error) {
    console.error('❌ [Org Events] Refresh failed:', error.message);
    return false;
  }
}

/**
 * Helper function: Notify user of organization approval
 * Called when an organization application is approved
 * 
 * @param {Object} organizationData - Basic organization data from approval
 * @param {string[]} memberEmails - Emails of organization members to notify
 * @returns {Promise<Object>} Notification results
 */
async function notifyOrganizationApproved(organizationData, memberEmails) {
  console.log('🎉 [Org Events] Organization approved - notifying members:', {
    organizationId: organizationData.organization_id,
    organizationVersionId: organizationData.organization_version_id,
    organizationName: organizationData.name,
    memberCount: memberEmails.length,
    memberEmails: memberEmails,
    completeOrgData: organizationData
  });

  const results = {
    successful: 0,
    failed: 0,
    errors: []
  };

  // � Enhanced approach: Get fresh data for each user individually
  const memberNotifications = memberEmails.map(async (email) => {
    try {
      // Get fresh organization data for this specific user
      const freshOrgData = await getUpdatedUserOrganizationData(email, organizationData.organization_id);
      
      if (freshOrgData) {
        // Create event with actual fresh data from database
        const eventData = {
          organizationId: organizationData.organization_id,
          organizationVersionId: freshOrgData.current_org_version_id,
          organizationName: freshOrgData.name,
          organizationData: freshOrgData,
          metadata: {
            event_description: `Organization "${freshOrgData.name}" has been approved`,
            action_required: false,
            refresh_user_cache: true,
            user_position: freshOrgData.position
          },
          source: 'organization_approval'
        };

        // Send individual notification with fresh data
        const success = await publishUserOrganizationEvent(
          email,
          ORGANIZATION_EVENT_TYPES.ORGANIZATION_APPROVED,
          eventData
        );

        if (success) {
          results.successful++;
          
          // Also send organizations list update
          const allFreshOrgs = await userModel.getPermissions(email);
          await publishUserOrganizationEvent(email, 'ORGANIZATIONS_UPDATED', {
            organizations: allFreshOrgs?.organizations || [],
            updatedOrganization: freshOrgData,
            reason: 'organization_approved'
          });
        } else {
          results.failed++;
          results.errors.push(`Failed to notify ${email}`);
        }
      } else {
        results.failed++;
        results.errors.push(`No organization data found for ${email}`);
      }
    } catch (error) {
      console.error(`❌ [Org Events] Member process error for ${email}:`, error.message);
      results.failed++;
      results.errors.push(`Error processing ${email}: ${error.message}`);
    }
  });

  // Wait for all member notifications to complete
  await Promise.all(memberNotifications);

  if (results.successful > 0 || results.failed > 0) {
    console.log(`📊 Org approval: ${results.successful} notified${results.failed > 0 ? `, ${results.failed} failed` : ''}`);
  }
  return results;
}

/**
 * Helper function: Notify user of organization renewal
 * Called when an organization renewal is processed
 * 
 * @param {string} organizationId - ID of the renewed organization
 * @param {string} organizationName - Name of the renewed organization
 * @param {string[]} memberEmails - Emails of organization members to notify
 * @returns {Promise<Object>} Notification results
 */
async function notifyOrganizationRenewed(organizationId, organizationName, memberEmails) {
  console.log('🔄 [Org Events] Organization renewed - notifying members:', {
    organizationId,
    organizationName,
    memberCount: memberEmails.length
  });

  const eventData = {
    organizationId,
    organizationName,
    metadata: {
      event_description: `Organization "${organizationName}" has been renewed`,
      action_required: false
    }
  };

  return await publishBulkUserOrganizationEvents(
    memberEmails,
    ORGANIZATION_EVENT_TYPES.ORGANIZATION_RENEWED,
    eventData
  );
}

/**
 * Helper function: Notify user of membership granted
 * Called when a user is added to an organization
 * 
 * @param {string} userEmail - Email of the user granted membership
 * @param {string} organizationId - ID of the organization
 * @param {string} organizationName - Name of the organization
 * @param {string} role - Role granted to the user
 * @returns {Promise<boolean>} Success status
 */
async function notifyMembershipGranted(userEmail, organizationId, organizationName, role) {
  console.log('👤 [Org Events] Membership granted - notifying user:', {
    userEmail,
    organizationId,
    organizationName,
    role
  });

  const eventData = {
    organizationId,
    organizationName,
    newRole: role,
    metadata: {
      event_description: `You have been granted ${role} membership in "${organizationName}"`,
      action_required: false
    }
  };

  return await publishUserOrganizationEvent(
    userEmail,
    ORGANIZATION_EVENT_TYPES.MEMBERSHIP_GRANTED,
    eventData
  );
}

/**
 * Helper function: Notify user of membership revoked
 * Called when a user is removed from an organization
 * 
 * @param {string} userEmail - Email of the user whose membership was revoked
 * @param {string} organizationId - ID of the organization
 * @param {string} organizationName - Name of the organization
 * @param {string} reason - Reason for revocation
 * @returns {Promise<boolean>} Success status
 */
async function notifyMembershipRevoked(userEmail, organizationId, organizationName, reason) {
  console.log('🚫 [Org Events] Membership revoked - notifying user:', {
    userEmail,
    organizationId,
    organizationName,
    reason
  });

  const eventData = {
    organizationId,
    organizationName,
    metadata: {
      event_description: `Your membership in "${organizationName}" has been revoked`,
      reason: reason,
      action_required: true
    }
  };

  return await publishUserOrganizationEvent(
    userEmail,
    ORGANIZATION_EVENT_TYPES.MEMBERSHIP_REVOKED,
    eventData
  );
}

module.exports = {
  // Constants
  ORGANIZATION_EVENT_TYPES,
  
  // Core functions
  publishUserOrganizationEvent,
  publishBulkUserOrganizationEvents,
  refreshUserOrganizations,
  getUpdatedUserOrganizationData, // 🆕 New helper function
  
  // Helper functions for common scenarios
  notifyOrganizationApproved,
  notifyOrganizationRenewed,
  notifyMembershipGranted,
  notifyMembershipRevoked
};