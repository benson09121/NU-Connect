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
    console.log('🔔 [Org Events] Publishing organization event:', {
      userEmail,
      eventType,
      organizationId: eventData.organizationId,
      organizationName: eventData.organizationName
    });

    // Construct the user-specific channel
    const userChannel = `user_organizations_${userEmail}`;

    // Create the event payload
    const eventPayload = {
      channel: userChannel,          // 🆕 Add channel for frontend routing
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

    console.log('🔍 [Org Events] About to publish to channel:', {
      channel: userChannel,
      payload: eventPayload
    });

    // Publish to the user's organization channel
    const publishResult = publishToChannel(userChannel, eventPayload);
    
    console.log('🔍 [Org Events] publishToChannel result:', publishResult);

    console.log('✅ [Org Events] Successfully published organization event:', {
      channel: userChannel,
      eventType,
      timestamp: eventPayload.timestamp
    });

    return true;

  } catch (error) {
    console.error('❌ [Org Events] Failed to publish organization event:', {
      userEmail,
      eventType,
      error: error.message,
      stack: error.stack
    });
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
    console.log('📢 [Org Events] Publishing bulk organization events:', {
      userCount: userEmails.length,
      eventType,
      organizationId: eventData.organizationId,
      userEmails: userEmails
    });

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    // Process each user in parallel for better performance
    const publishPromises = userEmails.map(async (email, index) => {
      try {
        console.log(`🔍 [Org Events] Processing user ${index + 1}/${userEmails.length}: ${email}`);
        const success = await publishUserOrganizationEvent(email, eventType, eventData);
        if (success) {
          results.successful++;
          console.log(`✅ [Org Events] Successfully notified: ${email}`);
        } else {
          results.failed++;
          results.errors.push(`Failed to notify ${email}`);
          console.error(`❌ [Org Events] Failed to notify: ${email}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error notifying ${email}: ${error.message}`);
      }
    });

    await Promise.all(publishPromises);

    console.log('📊 [Org Events] Bulk organization events completed:', results);
    return results;

  } catch (error) {
    console.error('❌ [Org Events] Failed bulk organization event publishing:', {
      userEmails: userEmails.length,
      eventType,
      error: error.message
    });
    
    return {
      successful: 0,
      failed: userEmails.length,
      errors: [`Bulk operation failed: ${error.message}`]
    };
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
    console.log('🔄 [Org Events] Refreshing user organizations:', {
      userEmail,
      reason
    });

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

    console.log('✅ [Org Events] User organizations refreshed:', {
      userEmail,
      organizationCount: organizations.length,
      reason
    });

    return true;

  } catch (error) {
    console.error('❌ [Org Events] Failed to refresh user organizations:', {
      userEmail,
      reason,
      error: error.message
    });
    return false;
  }
}

/**
 * Helper function: Notify user of organization approval
 * Called when an organization application is approved
 * 
 * @param {string} organizationId - ID of the approved organization
 * @param {string} organizationName - Name of the approved organization
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

  // 🎯 Format data to match GetUserPermissions API response structure
  const eventData = {
    organizationId: organizationData.organization_id,
    organizationVersionId: organizationData.organization_version_id,
    organizationName: organizationData.name,
    // 🔄 Match GetUserPermissions format exactly
    organizationData: {
      name: organizationData.name,
      logo: organizationData.logo,
      status: organizationData.status || 'Approved',
      organization_id: organizationData.organization_id,
      current_org_version_id: organizationData.organization_version_id,
      cycle_number: organizationData.effective_cycle || organizationData.cycle_number || 1,
      position: 'Executive' // Default position for newly approved organization
    },
    metadata: {
      event_description: `Organization "${organizationData.name}" has been approved`,
      action_required: false,
      refresh_user_cache: true // 🔄 Flag to trigger cache refresh
    },
    source: 'organization_events'
  };

  console.log('🔍 [Org Events] Calling publishBulkUserOrganizationEvents with complete data:', {
    memberEmails,
    eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_APPROVED,
    eventData
  });

  const result = await publishBulkUserOrganizationEvents(
    memberEmails,
    ORGANIZATION_EVENT_TYPES.ORGANIZATION_APPROVED,
    eventData
  );

  console.log('✅ [Org Events] publishBulkUserOrganizationEvents result:', result);
  return result;
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
  
  // Helper functions for common scenarios
  notifyOrganizationApproved,
  notifyOrganizationRenewed,
  notifyMembershipGranted,
  notifyMembershipRevoked
};